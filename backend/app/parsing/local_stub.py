"""Local MinerU parsing via the `mineru` CLI.

Selected with `MINERU_MODE=local`. Keeps the same contract as the HTTP parser so
the rest of the backend does not care which one is active. If the CLI is absent
the error message tells the operator how to enable either backend.
"""

from __future__ import annotations

import asyncio
import shutil
import tempfile
from pathlib import Path

from ..config import Settings, get_settings
from .base import ParsedDocument, PdfParseError, PdfParser, split_markdown_sections

CLI_NAME = "mineru"


class LocalMineruParser(PdfParser):
    name = "mineru-local"

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    async def parse_bytes(self, data: bytes, file_name: str) -> ParsedDocument:
        binary = shutil.which(CLI_NAME)
        if not binary:
            raise PdfParseError(
                "MINERU_MODE=local but the `mineru` CLI is not on PATH. Install it "
                "(`pip install mineru`) or switch to MINERU_MODE=api."
            )

        safe_name = Path(file_name or "paper.pdf").name
        if not safe_name.lower().endswith(".pdf"):
            safe_name += ".pdf"

        with tempfile.TemporaryDirectory(prefix="mineru-") as workdir:
            root = Path(workdir)
            source = root / safe_name
            source.write_bytes(data)
            output = root / "out"
            output.mkdir()

            process = await asyncio.create_subprocess_exec(
                binary, "-p", str(source), "-o", str(output),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            try:
                stdout, _ = await asyncio.wait_for(
                    process.communicate(), timeout=self._settings.mineru_timeout_seconds
                )
            except asyncio.TimeoutError as error:
                process.kill()
                raise PdfParseError("The local MinerU run timed out.") from error

            if process.returncode != 0:
                tail = (stdout or b"").decode("utf-8", errors="replace")[-500:]
                raise PdfParseError(f"Local MinerU failed (exit {process.returncode}): {tail}")

            markdown_files = sorted(output.rglob("*.md"), key=lambda p: p.stat().st_size, reverse=True)
            if not markdown_files:
                raise PdfParseError("Local MinerU produced no markdown output.")

            markdown = markdown_files[0].read_text(encoding="utf-8", errors="replace")

        return ParsedDocument(markdown=markdown, sections=split_markdown_sections(markdown), parser=self.name)

    async def parse_url(self, url: str) -> ParsedDocument:
        from ..tools.http import ToolHttpError, get_bytes

        try:
            data, _ = await get_bytes(url, timeout=self._settings.mineru_timeout_seconds)
        except ToolHttpError as error:
            raise PdfParseError(str(error)) from error
        return await self.parse_bytes(data, url.rsplit("/", 1)[-1] or "paper.pdf")
