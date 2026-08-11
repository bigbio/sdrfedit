"""Select the configured PDF parser."""

from __future__ import annotations

from ..config import get_settings
from .base import PdfParser
from .local_stub import LocalMineruParser
from .mineru_api import MineruApiParser


def get_pdf_parser() -> PdfParser:
    settings = get_settings()
    if settings.mineru_mode == "local":
        return LocalMineruParser(settings)
    return MineruApiParser(settings)
