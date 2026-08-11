"""Tools that query the local Cellosaurus / cell-line knowledge base."""

from __future__ import annotations

from ..celllines.loader import normalize_cellosaurus_accession
from ..celllines.store import get_cellline_store
from .http import ToolHttpError


async def search_cell_line(query: str, limit: int = 8) -> dict:
    """Find cell lines by name, synonym, or Cellosaurus accession."""
    if not (query or "").strip():
        raise ToolHttpError("A non-empty query is required.")

    store = get_cellline_store()
    if not store.ready:
        raise ToolHttpError(
            "Cell-line index is empty. Run: python -m app.celllines.build_index"
        )

    hits = await store.search(query.strip(), k=max(1, min(int(limit or 8), 20)))
    matches = []
    for hit in hits:
        payload = hit.record.to_dict()
        payload["score"] = round(hit.score, 4)
        payload["matchMode"] = hit.mode
        matches.append(payload)

    return {
        "query": query,
        "retrieval": store.retrieval_mode,
        "recordCount": store.record_count,
        "matches": matches,
        "note": (
            "Use cellosaurusAccession (CVCL_…) and cellLine / cellosaurusName exactly. "
            "Prefer search_cell_line over OLS for cell-line and Cellosaurus fields. "
            "Do NOT call verify_ontology_term on CVCL_ accessions."
            if matches
            else "No match — try an alternate spelling or the reserved value 'not available'."
        ),
    }


async def verify_cellosaurus_accession(accession: str, expected_label: str | None = None) -> dict:
    """Confirm a Cellosaurus accession exists in the local curated table."""
    normalized = normalize_cellosaurus_accession(accession)
    if not normalized:
        raise ToolHttpError(
            f"'{accession}' is not a Cellosaurus id. Expected CVCL_0030 (underscore), "
            "not an OLS CURIE. Use search_cell_line for names."
        )

    store = get_cellline_store()
    record = store.get_by_accession(normalized)
    if not record:
        return {
            "accession": normalized,
            "valid": False,
            "reason": "Accession not found in the local cell-line database.",
            "hint": "Call search_cell_line with the cell-line name instead.",
        }

    payload = {
        "accession": normalized,
        "valid": True,
        "term": record.to_dict(),
    }
    if expected_label:
        candidates = {
            record.cell_line.casefold(),
            record.cellosaurus_name.casefold(),
            *(alias.casefold() for alias in record.synonyms),
        }
        matches = expected_label.strip().casefold() in candidates
        payload["labelMatches"] = matches
        if not matches:
            payload["reason"] = (
                f"Accession {normalized} is '{record.cellosaurus_name or record.cell_line}', "
                f"not '{expected_label}'."
            )
    return payload
