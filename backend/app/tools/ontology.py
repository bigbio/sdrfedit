"""EBI OLS4 lookups, so proposed values carry verified accessions.

Every ontology value the assistant suggests is resolved through this module
before it reaches the browser. That is what stops the model from inventing
plausible-looking accessions (the classic failure being UNIMOD:1 Acetyl vs
UNIMOD:21 Phospho).
"""

from __future__ import annotations

import re

from .http import ToolHttpError, get_json

OLS_SELECT = "https://www.ebi.ac.uk/ols4/api/select"
OLS_TERMS = "https://www.ebi.ac.uk/ols4/api/ontologies/{ontology}/terms"

# Which ontologies to search for a given SDRF column.
COLUMN_ONTOLOGIES: dict[str, list[str]] = {
    "organism": ["ncbitaxon"],
    "organism part": ["uberon", "bto"],
    "tissue": ["uberon", "bto"],
    "sampling site": ["uberon", "bto"],
    "disease": ["efo", "mondo", "doid"],
    "cell type": ["cl", "bto"],
    "cell line": ["clo", "bto", "efo"],
    "culture medium": ["ncit"],
    "developmental stage": ["efo", "hsapdv", "uberon"],
    "ancestry category": ["hancestro"],
    "sex": ["pato", "efo"],
    "instrument": ["ms"],
    "cleavage agent details": ["ms"],
    "dissociation method": ["ms"],
    "modification parameters": ["unimod", "mod"],
    "enrichment process": ["pride", "ms"],
    "label": ["pride", "ms"],
    "technology type": ["efo", "pride"],
    "material type": ["efo", "bto"],
}

# Common wrong / shorthand column names the model may pass to search_ontology.
COLUMN_ALIASES: dict[str, str] = {
    "modifications": "modification parameters",
    "modification": "modification parameters",
    "ptm": "modification parameters",
    "ptms": "modification parameters",
    "post-translational modifications": "modification parameters",
    "cleavage agent": "cleavage agent details",
    "cleavage": "cleavage agent details",
    "enzyme": "cleavage agent details",
    "protease": "cleavage agent details",
    "ms instrument": "instrument",
    "mass spectrometer": "instrument",
}

DEFAULT_ONTOLOGIES = ["efo", "ncbitaxon", "uberon", "ms", "pride", "unimod"]

# Columns that must use Cellosaurus tools, not OLS.
CELLOSAURUS_COLUMNS = frozenset(
    {
        "cellosaurus accession",
        "cellosaurus name",
    }
)

RESERVED_VALUES = frozenset(
    {
        "not available",
        "not applicable",
        "pooled",
        "anonymized",
    }
)


def column_key(column: str) -> str:
    """Strip characteristics/comment/factor value wrappers and resolve aliases."""
    key = re.sub(
        r"^(characteristics|comment|factor value)\[(.*)\]$",
        r"\2",
        (column or "").strip().lower(),
    )
    return COLUMN_ALIASES.get(key, key)


def ontologies_for(column: str) -> list[str]:
    """Map an SDRF column name (with or without the characteristics wrapper)."""
    return COLUMN_ONTOLOGIES.get(column_key(column), DEFAULT_ONTOLOGIES)


def is_cellosaurus_column(column: str) -> bool:
    return column_key(column) in CELLOSAURUS_COLUMNS or column_key(column) == "cell line"


def is_reserved_value(value: str) -> bool:
    return (value or "").strip().lower() in RESERVED_VALUES


def _format_term(doc: dict) -> dict:
    short_form = doc.get("short_form") or doc.get("obo_id") or ""
    obo_id = doc.get("obo_id") or short_form.replace("_", ":")
    return {
        "id": obo_id,
        "label": doc.get("label", ""),
        "ontology": (doc.get("ontology_prefix") or doc.get("ontology_name") or "").upper(),
        "iri": doc.get("iri"),
        "description": (doc.get("description") or [""])[0] if isinstance(doc.get("description"), list) else doc.get("description") or "",
        "obsolete": bool(doc.get("is_obsolete")),
    }


def _no_match_hint(column: str | None, query: str) -> str:
    key = column_key(column or "")
    if key == "culture medium":
        return (
            f"No NCIT match for '{query}'. Search the base medium name only "
            "(e.g. 'RPMI 1640' or 'DMEM'), not the full recipe with serum/antibiotics. "
            "If unknown, propose the reserved value 'not available'."
        )
    return (
        f"No ontology match for '{query}' on column '{column}'. "
        "Narrow the query to the controlled term (not a full sentence), "
        "or propose 'not available' if the source does not state a value. "
        "Do not propose free-text for ontology-backed columns."
    )


async def search_terms(
    query: str,
    column: str | None = None,
    ontologies: list[str] | None = None,
    limit: int = 8,
) -> dict:
    """Search OLS for candidate terms for a column value.

    ``column`` is required so the search stays inside the template-declared
    ontologies. Returns ``ok: false`` with a hint when nothing matches.
    """
    if not query or not query.strip():
        raise ToolHttpError("A non-empty query is required.")
    if not column or not str(column).strip():
        raise ToolHttpError(
            "Argument 'column' is required (e.g. 'characteristics[culture medium]') "
            "so the search uses the correct ontologies."
        )

    key = column_key(column)
    if key in CELLOSAURUS_COLUMNS or (key == "cell line" and not ontologies):
        # cell line has OLS ontologies in templates, but Cellosaurus is preferred for names/accessions.
        if key in CELLOSAURUS_COLUMNS:
            return {
                "ok": False,
                "query": query,
                "column": column,
                "ontologiesSearched": [],
                "terms": [],
                "error": "Cellosaurus column — use search_cell_line / verify_cellosaurus_accession, not search_ontology.",
                "hint": "Call search_cell_line with the cell-line name, or verify_cellosaurus_accession for CVCL_… ids.",
            }

    if ontologies:
        target = [str(item).strip().lower() for item in ontologies if str(item).strip()]
    else:
        mapped = COLUMN_ONTOLOGIES.get(key)
        if mapped is None:
            return {
                "ok": False,
                "query": query,
                "column": column,
                "ontologiesSearched": [],
                "terms": [],
                "error": f"No ontology mapping for column '{column}'.",
                "hint": (
                    "This column may be free text or pattern-validated. "
                    "For PTMs use column 'comment[modification parameters]' "
                    "(or 'modification parameters'); for enzymes use "
                    "'comment[cleavage agent details]'; for instruments use "
                    "'comment[instrument]'. Do not invent an OLS term."
                ),
            }
        target = list(mapped)

    if is_reserved_value(query):
        return {
            "ok": True,
            "query": query,
            "column": column,
            "ontologiesSearched": target,
            "terms": [],
            "reserved": True,
            "note": f"'{query.strip().lower()}' is a reserved SDRF value — propose it as-is without an ontology term.",
        }

    payload = await get_json(
        OLS_SELECT,
        params={
            "q": query.strip(),
            "ontology": ",".join(target),
            "rows": max(1, min(limit, 20)),
            "fieldList": "iri,label,short_form,obo_id,ontology_name,ontology_prefix,description,is_obsolete",
        },
    )
    docs = payload.get("response", {}).get("docs", [])
    terms = [_format_term(doc) for doc in docs if not doc.get("is_obsolete")]

    if not terms:
        return {
            "ok": False,
            "query": query,
            "column": column,
            "ontologiesSearched": target,
            "terms": [],
            "error": "No match found in the column ontologies.",
            "hint": _no_match_hint(column, query.strip()),
        }

    return {
        "ok": True,
        "query": query,
        "column": column,
        "ontologiesSearched": target,
        "terms": terms,
        "note": (
            "Use the exact id and label from this list as addCharacteristicChoice "
            "args [column, label, {id, label}]. Do not paste recipes or free text."
        ),
    }


async def verify_term(accession: str, expected_label: str | None = None) -> dict:
    """Confirm an accession exists and (optionally) matches an expected label."""
    accession = (accession or "").strip()
    upper = accession.upper()
    if upper.startswith("CVCL_") or upper.startswith("CVCL:"):
        raise ToolHttpError(
            f"'{accession}' is a Cellosaurus id, not an OLS CURIE. "
            "Call search_cell_line or verify_cellosaurus_accession instead."
        )
    if ":" not in accession:
        raise ToolHttpError(
            f"'{accession}' is not a CURIE like UNIMOD:4 or MS:1000031. "
            "For cell lines use search_cell_line (Cellosaurus ids look like CVCL_0030)."
        )

    prefix, _ = accession.split(":", 1)
    ontology = prefix.lower()
    payload = await get_json(
        OLS_SELECT,
        params={
            "q": accession,
            "ontology": ontology,
            "queryFields": "obo_id,short_form",
            "rows": 5,
            "fieldList": "iri,label,short_form,obo_id,ontology_name,ontology_prefix,description,is_obsolete",
        },
    )
    docs = payload.get("response", {}).get("docs", [])
    match = next(
        (d for d in docs if (d.get("obo_id") or "").upper() == accession.upper()),
        None,
    )
    if not match:
        return {
            "ok": False,
            "accession": accession,
            "valid": False,
            "reason": "Accession not found in OLS.",
            "hint": "Call search_ontology with the column and a short label query, then use a returned id.",
        }

    term = _format_term(match)
    result: dict = {"ok": True, "accession": accession, "valid": True, "term": term}
    if expected_label:
        matches = term["label"].strip().lower() == expected_label.strip().lower()
        result["labelMatches"] = matches
        if not matches:
            result["ok"] = False
            result["valid"] = False
            result["reason"] = f"Accession {accession} is '{term['label']}', not '{expected_label}'."
            result["hint"] = f"Propose value '{term['label']}' with id {accession}, or search again."
    return result
