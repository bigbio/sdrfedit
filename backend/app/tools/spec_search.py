"""Specification knowledge base lookup exposed as an agent tool."""

from __future__ import annotations

from ..rag.store import get_spec_store
from ..schemas import Citation

MAX_SNIPPET = 1600


async def search_specification(query: str, k: int = 5) -> dict:
    """Retrieve the most relevant SDRF specification passages for a query."""
    store = get_spec_store()
    if not store.ready:
        return {
            "query": query,
            "passages": [],
            "note": "The specification index has not been built. Run `python -m app.rag.build_index`.",
        }

    hits = await store.search(query, k=k)
    return {
        "query": query,
        "retrieval": store.retrieval_mode,
        "passages": [
            {
                "section": f"{hit.chunk.section_number} {hit.chunk.title}".strip(),
                "headingPath": " > ".join(hit.chunk.heading_path),
                "anchor": hit.chunk.anchor,
                "score": round(hit.score, 4),
                "text": hit.chunk.text[:MAX_SNIPPET],
            }
            for hit in hits
        ],
        "note": "Quote these passages when answering; cite the section number.",
    }


async def citations_for(query: str, k: int = 3) -> list[Citation]:
    """Build citation objects for the UI from a specification query."""
    store = get_spec_store()
    if not store.ready:
        return []
    hits = await store.search(query, k=k)
    return [
        Citation(
            source="spec",
            title=f"{hit.chunk.section_number} {hit.chunk.title}".strip(),
            anchor=hit.chunk.anchor,
            url=hit.chunk.anchor,
            snippet=hit.chunk.text[:320],
        )
        for hit in hits
    ]
