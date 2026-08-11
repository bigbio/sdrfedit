"""Build the cell-line vector index from curated TSV tables.

    python -m app.celllines.build_index
    python -m app.celllines.build_index --lexical-only

Without an embedding endpoint the records are still written and search falls
back to lexical scoring (plus exact accession / name boosts).
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from ..config import get_settings
from ..rag.embeddings import EmbeddingError, embed_texts
from .loader import load_cellline_records
from .store import get_cellline_store


async def build(*, lexical_only: bool = False) -> int:
    settings = get_settings()
    db_path = settings.cellline_db_path
    synonyms_path = settings.cellline_synonyms_path

    print(f"Loading cell lines from {db_path}")
    print(f"Merging synonyms from {synonyms_path}")
    records = load_cellline_records(db_path, synonyms_path)
    if not records:
        print("No cell-line records loaded.", file=sys.stderr)
        return 1

    with_acc = sum(1 for record in records if record.has_accession)
    print(f"Loaded {len(records)} records ({with_acc} with Cellosaurus accessions).")

    vectors: list[list[float]] | None = None
    model: str | None = None
    if lexical_only or not settings.embeddings_configured:
        print("Writing lexical-only index (no embeddings).")
    else:
        print(f"Embedding with {settings.embedding_model} ...")
        try:
            texts = [record.embed_text() for record in records]
            vectors = await embed_texts(texts, settings)
            model = settings.embedding_model
        except EmbeddingError as error:
            print(f"Embedding failed, writing lexical-only index: {error}", file=sys.stderr)
            vectors = None

    store = get_cellline_store()
    source = f"{db_path.name}+{synonyms_path.name}"
    store.save(records, vectors, source=source, embedding_model=model)
    print(f"Index written to {store.index_dir} (retrieval mode: {store.retrieval_mode}).")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the cell-line knowledge index.")
    parser.add_argument(
        "--lexical-only",
        action="store_true",
        help="Skip embeddings even when an embedding endpoint is configured.",
    )
    args = parser.parse_args()
    return asyncio.run(build(lexical_only=args.lexical_only))


if __name__ == "__main__":
    raise SystemExit(main())
