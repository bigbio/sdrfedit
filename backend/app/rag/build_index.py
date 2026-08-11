"""Build the SDRF specification knowledge base.

    python -m app.rag.build_index                 # bundled copy, or fetch if missing
    python -m app.rag.build_index --fetch         # always fetch the live page
    python -m app.rag.build_index --source FILE   # index a local HTML/markdown file

Without an embedding endpoint configured the index is still written and
retrieval falls back to lexical scoring.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

import httpx

from ..config import get_settings
from .chunker import chunk_document, html_to_text
from .embeddings import EmbeddingError, embed_texts
from .store import get_spec_store


async def fetch_spec(url: str) -> str:
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        response = await client.get(url, headers={"User-Agent": "sdrfedit-assistant/1.0"})
        response.raise_for_status()
        return response.text


def looks_like_html(text: str) -> bool:
    head = text[:2000].lower()
    return "<html" in head or "<body" in head or "<h1" in head or "<div" in head


async def build(source: str | None, fetch: bool) -> int:
    settings = get_settings()
    store = get_spec_store()

    if source:
        raw = open(source, encoding="utf-8").read()
        origin = source
    elif fetch or not settings.spec_source_path.exists():
        print(f"Fetching {settings.spec_url} ...")
        raw = await fetch_spec(settings.spec_url)
        settings.spec_source_path.parent.mkdir(parents=True, exist_ok=True)
        settings.spec_source_path.write_text(raw, encoding="utf-8")
        origin = settings.spec_url
    else:
        raw = settings.spec_source_path.read_text(encoding="utf-8")
        origin = str(settings.spec_source_path)

    text = html_to_text(raw) if looks_like_html(raw) else raw
    chunks = chunk_document(text, source_url=settings.spec_url)
    if not chunks:
        print("No chunks produced - check the source document.", file=sys.stderr)
        return 1

    print(f"Chunked {origin} into {len(chunks)} sections.")

    vectors: list[list[float]] | None = None
    model: str | None = None
    if settings.embeddings_configured:
        print(f"Embedding with {settings.embedding_model} ...")
        try:
            vectors = await embed_texts([c.embed_text for c in chunks], settings)
            model = settings.embedding_model
        except EmbeddingError as error:
            print(f"Embedding failed, writing lexical-only index: {error}", file=sys.stderr)
            vectors = None
    else:
        print("No embedding endpoint configured - writing lexical-only index.")

    store.save(chunks, vectors, source=origin, embedding_model=model)
    print(f"Index written to {store.index_dir} (retrieval mode: {store.retrieval_mode}).")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the SDRF specification index.")
    parser.add_argument("--source", help="Local HTML or markdown file to index.")
    parser.add_argument("--fetch", action="store_true", help="Re-download the live specification page.")
    args = parser.parse_args()
    return asyncio.run(build(args.source, args.fetch))


if __name__ == "__main__":
    raise SystemExit(main())
