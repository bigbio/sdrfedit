"""MinerU-backed PDF parsing over HTTP.

Two upstream contracts are supported, selected by `MINERU_FLAVOR`:

`official` (default)
    The hosted API at https://mineru.net/api/v4 - submit a task, poll until it
    finishes, then download the result ZIP and read the markdown out of it.

`simple`
    A self-hosted MinerU FastAPI deployment that accepts a multipart upload on
    `POST {base}/file_parse` and answers with markdown (JSON or text/plain).
"""

from __future__ import annotations

import asyncio
import io
import json
import zipfile

import httpx

from ..config import Settings, get_settings
from .base import ParsedDocument, PdfParseError, PdfParser, split_markdown_sections

TERMINAL_FAILURE_STATES = {"failed", "error", "convert_failed"}
TERMINAL_SUCCESS_STATES = {"done", "success", "completed"}


class MineruApiParser(PdfParser):
    name = "mineru-api"

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self.name = f"mineru-{self._settings.mineru_flavor}"

    # ------------------------------------------------------------------ public

    async def parse_bytes(self, data: bytes, file_name: str) -> ParsedDocument:
        if self._settings.mineru_flavor == "simple":
            return await self._parse_simple(data, file_name)
        return await self._parse_official_upload(data, file_name)

    async def parse_url(self, url: str) -> ParsedDocument:
        if self._settings.mineru_flavor == "simple":
            from ..tools.http import get_bytes

            data, _ = await get_bytes(url, timeout=self._settings.mineru_timeout_seconds)
            return await self._parse_simple(data, url.rsplit("/", 1)[-1] or "paper.pdf")
        return await self._parse_official_url(url)

    # ------------------------------------------------------------------ shared

    @property
    def _base(self) -> str:
        return self._settings.mineru_base_url.rstrip("/")

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "*/*"}
        if self._settings.mineru_api_key:
            headers["Authorization"] = f"Bearer {self._settings.mineru_api_key}"
        return headers

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=self._settings.mineru_timeout_seconds, follow_redirects=True)

    def _require_key(self) -> None:
        if not self._settings.mineru_api_key and "mineru.net" in self._base:
            raise PdfParseError(
                "MinerU is not configured. Set MINERU_API_KEY (hosted API) or point "
                "MINERU_BASE_URL at your own MinerU deployment with MINERU_FLAVOR=simple."
            )

    # --------------------------------------------------------------- flavors

    async def _parse_simple(self, data: bytes, file_name: str) -> ParsedDocument:
        url = f"{self._base}/file_parse"
        async with self._client() as client:
            response = await client.post(
                url,
                headers=self._headers(),
                files={"file": (file_name or "paper.pdf", data, "application/pdf")},
                data={"return_md": "true", "parse_method": "auto"},
            )
        if response.status_code >= 400:
            raise PdfParseError(f"MinerU request failed ({response.status_code}): {response.text[:300]}")

        markdown = self._markdown_from_payload(response)
        if not markdown.strip():
            raise PdfParseError("MinerU returned an empty document.")
        return ParsedDocument(markdown=markdown, sections=split_markdown_sections(markdown), parser=self.name)

    @staticmethod
    def _markdown_from_payload(response: httpx.Response) -> str:
        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            payload = response.json()
            for key in ("md_content", "markdown", "md", "content", "text"):
                value = payload.get(key) if isinstance(payload, dict) else None
                if isinstance(value, str) and value.strip():
                    return value
            results = payload.get("results") if isinstance(payload, dict) else None
            if isinstance(results, dict):
                for entry in results.values():
                    if isinstance(entry, dict):
                        for key in ("md_content", "markdown", "md"):
                            if isinstance(entry.get(key), str):
                                return entry[key]
            raise PdfParseError(f"Unexpected MinerU JSON response: {json.dumps(payload)[:300]}")
        return response.text

    async def _parse_official_url(self, url: str) -> ParsedDocument:
        self._require_key()
        async with self._client() as client:
            response = await client.post(
                f"{self._base}/extract/task",
                headers={**self._headers(), "Content-Type": "application/json"},
                json={
                    "url": url,
                    "is_ocr": True,
                    "enable_formula": False,
                    "enable_table": True,
                    "language": "en",
                },
            )
            payload = self._json_or_raise(response)
            task_id = (payload.get("data") or {}).get("task_id")
            if not task_id:
                raise PdfParseError(f"MinerU did not return a task id: {json.dumps(payload)[:300]}")
            zip_url = await self._poll_task(client, f"{self._base}/extract/task/{task_id}")
            return await self._document_from_zip(client, zip_url)

    async def _parse_official_upload(self, data: bytes, file_name: str) -> ParsedDocument:
        self._require_key()
        async with self._client() as client:
            response = await client.post(
                f"{self._base}/file-urls/batch",
                headers={**self._headers(), "Content-Type": "application/json"},
                json={
                    "enable_formula": False,
                    "enable_table": True,
                    "language": "en",
                    "files": [{"name": file_name or "paper.pdf", "is_ocr": True}],
                },
            )
            payload = self._json_or_raise(response)
            data_block = payload.get("data") or {}
            upload_urls = data_block.get("file_urls") or []
            batch_id = data_block.get("batch_id")
            if not upload_urls or not batch_id:
                raise PdfParseError(f"MinerU upload handshake failed: {json.dumps(payload)[:300]}")

            put_response = await client.put(upload_urls[0], content=data)
            if put_response.status_code >= 400:
                raise PdfParseError(f"Uploading the PDF to MinerU failed ({put_response.status_code}).")

            zip_url = await self._poll_batch(client, f"{self._base}/extract-results/batch/{batch_id}")
            return await self._document_from_zip(client, zip_url)

    # ----------------------------------------------------------------- polling

    @staticmethod
    def _json_or_raise(response: httpx.Response) -> dict:
        if response.status_code >= 400:
            raise PdfParseError(f"MinerU request failed ({response.status_code}): {response.text[:300]}")
        try:
            payload = response.json()
        except ValueError as error:
            raise PdfParseError(f"MinerU returned non-JSON: {response.text[:200]}") from error
        if payload.get("code") not in (0, 200, None):
            raise PdfParseError(f"MinerU error {payload.get('code')}: {payload.get('msg') or payload}")
        return payload

    async def _poll_task(self, client: httpx.AsyncClient, url: str) -> str:
        deadline = asyncio.get_event_loop().time() + self._settings.mineru_timeout_seconds
        while asyncio.get_event_loop().time() < deadline:
            payload = self._json_or_raise(await client.get(url, headers=self._headers()))
            data = payload.get("data") or {}
            state = str(data.get("state") or data.get("status") or "").lower()
            if state in TERMINAL_SUCCESS_STATES:
                zip_url = data.get("full_zip_url") or data.get("zip_url")
                if not zip_url:
                    raise PdfParseError("MinerU finished but returned no result archive.")
                return zip_url
            if state in TERMINAL_FAILURE_STATES:
                raise PdfParseError(f"MinerU failed to parse the PDF: {data.get('err_msg') or state}")
            await asyncio.sleep(self._settings.mineru_poll_interval_seconds)
        raise PdfParseError("MinerU timed out while parsing the PDF.")

    async def _poll_batch(self, client: httpx.AsyncClient, url: str) -> str:
        deadline = asyncio.get_event_loop().time() + self._settings.mineru_timeout_seconds
        while asyncio.get_event_loop().time() < deadline:
            payload = self._json_or_raise(await client.get(url, headers=self._headers()))
            results = (payload.get("data") or {}).get("extract_result") or []
            for entry in results:
                state = str(entry.get("state") or "").lower()
                if state in TERMINAL_SUCCESS_STATES and entry.get("full_zip_url"):
                    return entry["full_zip_url"]
                if state in TERMINAL_FAILURE_STATES:
                    raise PdfParseError(f"MinerU failed to parse the PDF: {entry.get('err_msg') or state}")
            await asyncio.sleep(self._settings.mineru_poll_interval_seconds)
        raise PdfParseError("MinerU timed out while parsing the PDF.")

    # -------------------------------------------------------------------- zip

    async def _document_from_zip(self, client: httpx.AsyncClient, zip_url: str) -> ParsedDocument:
        response = await client.get(zip_url)
        if response.status_code >= 400:
            raise PdfParseError(f"Downloading the MinerU result failed ({response.status_code}).")

        markdown = extract_markdown_from_zip(response.content)
        return ParsedDocument(markdown=markdown, sections=split_markdown_sections(markdown), parser=self.name)


def extract_markdown_from_zip(payload: bytes) -> str:
    """Pull the largest markdown file out of a MinerU result archive."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(payload))
    except zipfile.BadZipFile as error:
        raise PdfParseError("MinerU result was not a valid ZIP archive.") from error

    candidates = [info for info in archive.infolist() if info.filename.lower().endswith(".md")]
    if not candidates:
        raise PdfParseError("MinerU result archive contained no markdown file.")

    best = max(candidates, key=lambda info: info.file_size)
    return archive.read(best).decode("utf-8", errors="replace")
