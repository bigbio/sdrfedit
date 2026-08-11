"""Shared HTTP helper for outbound tool calls."""

from __future__ import annotations

from typing import Any

import httpx

USER_AGENT = "sdrfedit-assistant/1.0 (+https://github.com/bigbio/sdrfedit)"


class ToolHttpError(RuntimeError):
    """Raised when an upstream service fails in a way the agent should see."""


async def get_json(url: str, *, params: dict[str, Any] | None = None, timeout: float = 30.0) -> Any:
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.get(url, params=params, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        if response.status_code == 404:
            raise ToolHttpError(f"Not found: {url}")
        if response.status_code >= 400:
            raise ToolHttpError(f"Request failed ({response.status_code}) for {url}: {response.text[:200]}")
        return response.json()


async def get_text(url: str, *, params: dict[str, Any] | None = None, timeout: float = 45.0) -> str:
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.get(url, params=params, headers={"User-Agent": USER_AGENT})
        if response.status_code == 404:
            raise ToolHttpError(f"Not found: {url}")
        if response.status_code >= 400:
            raise ToolHttpError(f"Request failed ({response.status_code}) for {url}: {response.text[:200]}")
        return response.text


async def get_bytes(url: str, *, timeout: float = 120.0, max_bytes: int = 60 * 1024 * 1024) -> tuple[bytes, str]:
    """Download a binary payload, returning (content, content_type)."""
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        async with client.stream("GET", url, headers={"User-Agent": USER_AGENT}) as response:
            if response.status_code >= 400:
                raise ToolHttpError(f"Download failed ({response.status_code}) for {url}")
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    raise ToolHttpError(f"Download exceeds {max_bytes // (1024 * 1024)} MB limit: {url}")
                chunks.append(chunk)
            return b"".join(chunks), response.headers.get("content-type", "")
