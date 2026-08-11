"""Tool schemas and dispatch for the agent loop.

Each entry is an OpenAI-style function declaration plus an async handler. The
handler receives the parsed arguments and the current session id, and returns a
JSON-serialisable result that is fed back to the model.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

from ..parsing.base import PdfParseError
from ..parsing.factory import get_pdf_parser
from ..session import get_session_store
from . import celllines, literature, ontology, pride, spec_search, templates
from .http import ToolHttpError, get_bytes

Handler = Callable[[dict[str, Any], str], Awaitable[Any]]

MAX_RESULT_CHARS = 24000
MAX_SUMMARY_CHARS = 240


# --------------------------------------------------------------------- handlers


async def _get_dataset(args: dict, _session: str) -> Any:
    return await pride.fetch_dataset_overview(args["accession"])


async def _get_raw_files(args: dict, _session: str) -> Any:
    return await pride.fetch_raw_files(args["accession"], int(args.get("limit", 400)))


async def _find_publication(args: dict, _session: str) -> Any:
    return await literature.lookup_publication(
        pmid=args.get("pmid"), doi=args.get("doi"), title=args.get("title")
    )


async def _get_full_text(args: dict, _session: str) -> Any:
    return await literature.fetch_full_text(args["pmcid"], args.get("sections"))


async def _search_specification(args: dict, _session: str) -> Any:
    return await spec_search.search_specification(args["query"], int(args.get("k", 5)))


async def _search_ontology(args: dict, _session: str) -> Any:
    return await ontology.search_terms(
        args["query"],
        column=args["column"],
        ontologies=args.get("ontologies"),
        limit=int(args.get("limit", 8)),
    )


async def _verify_ontology_term(args: dict, _session: str) -> Any:
    return await ontology.verify_term(args["accession"], args.get("expectedLabel"))


async def _search_cell_line(args: dict, _session: str) -> Any:
    return await celllines.search_cell_line(args["query"], int(args.get("limit", 8)))


async def _verify_cellosaurus(args: dict, _session: str) -> Any:
    return await celllines.verify_cellosaurus_accession(
        args["accession"], args.get("expectedLabel")
    )


async def _list_templates(args: dict, _session: str) -> Any:
    return await templates.list_templates(args.get("layer"))


async def _get_template_columns(args: dict, _session: str) -> Any:
    return await templates.get_template_columns(args["name"], args.get("version"))


async def _validate_templates(args: dict, _session: str) -> Any:
    return await templates.validate_combination(
        args.get("technology"), args.get("sample"), args.get("experiments") or []
    )


async def _parse_pdf_url(args: dict, session_id: str) -> Any:
    url = args["url"]
    parser = get_pdf_parser()
    try:
        document = await parser.parse_url(url)
    except (PdfParseError, ToolHttpError) as error:
        return {
            "ok": False,
            "error": str(error),
            "nextStep": "Ask the user to upload the paper PDF through the assistant panel.",
        }

    stored = get_session_store().add_document(session_id, url.rsplit("/", 1)[-1] or "paper.pdf", document, origin=url)
    return {
        "ok": True,
        "documentId": stored.document_id,
        "parser": document.parser,
        "charCount": document.char_count,
        "availableSections": list(document.sections.keys()),
        "nextStep": "Call read_document with this documentId to read specific sections.",
    }


async def _check_pdf_reachable(args: dict, _session: str) -> Any:
    """Confirm a candidate PDF URL is downloadable before spending a parse."""
    try:
        data, content_type = await get_bytes(args["url"], timeout=60.0, max_bytes=40 * 1024 * 1024)
    except ToolHttpError as error:
        return {"reachable": False, "error": str(error)}
    is_pdf = data[:5] == b"%PDF-" or "pdf" in content_type.lower()
    return {"reachable": True, "isPdf": is_pdf, "bytes": len(data), "contentType": content_type}


async def _list_documents(_args: dict, session_id: str) -> Any:
    stored = get_session_store().list_for_session(session_id)
    return {
        "documents": [
            {
                "documentId": d.document_id,
                "fileName": d.file_name,
                "origin": d.origin,
                "charCount": d.document.char_count,
                "availableSections": list(d.document.sections.keys()),
            }
            for d in stored
        ]
    }


async def _read_document(args: dict, session_id: str) -> Any:
    stored = get_session_store().get(args["documentId"])
    if not stored:
        return {"ok": False, "error": "Unknown documentId - it may have expired. Ask the user to re-upload."}
    if stored.session_id != session_id:
        return {"ok": False, "error": "That document belongs to a different session."}

    wanted = args.get("sections")
    limit = int(args.get("maxChars", 12000))
    sections = stored.document.sections or {"body": stored.document.markdown}

    if wanted:
        picked = {name: text for name, text in sections.items() if name in {w.lower() for w in wanted}}
        if not picked:
            picked = sections
    else:
        picked = sections

    budget = limit
    output: dict[str, str] = {}
    for name, text in picked.items():
        if budget <= 0:
            break
        output[name] = text[:budget]
        budget -= len(output[name])

    return {
        "ok": True,
        "fileName": stored.file_name,
        "availableSections": list(sections.keys()),
        "sections": output,
    }


# -------------------------------------------------------------------- summaries
#
# Every tool result is shown to the user as a collapsible row, so each tool needs
# a one-line gist that is readable without expanding the raw JSON.


def _join(items: list[Any], limit: int = 3) -> str:
    if not items:
        return ""
    head = ", ".join(str(item) for item in items[:limit] if item)
    return f"{head}, …" if len(items) > limit else head


def _summarize_dataset(result: dict) -> str:
    files = result.get("files") or {}
    parts: list[str] = [result.get("accession") or "PRIDE project"]
    if result.get("organisms"):
        parts.append(_join(result["organisms"], 2))
    if result.get("instruments"):
        parts.append(_join(result["instruments"], 2))
    if files.get("rawFileCount"):
        parts.append(f"{files['rawFileCount']} raw files")
    if result.get("references"):
        parts.append(f"{len(result['references'])} reference(s)")
    return " · ".join(part for part in parts if part)


def _summarize_raw_files(result: dict) -> str:
    names = result.get("rawFileNames") or []
    count = result.get("rawFileCount", len(names))
    listed = _join(names, 2)
    return f"{count} raw files" + (f": {listed}" if listed else "")


def _summarize_publication(result: dict) -> str:
    if not result.get("found"):
        return "No Europe PMC record matched"
    parts = [result.get("title") or "Untitled"]
    if result.get("journal"):
        parts.append(str(result["journal"]))
    parts.append("open full text" if result.get("fullTextAvailable") else "no open full text")
    if result.get("pdfUrls"):
        parts.append(f"{len(result['pdfUrls'])} PDF link(s)")
    return " · ".join(parts)


def _summarize_full_text(result: dict) -> str:
    sections = result.get("sections") or {}
    chars = sum(len(text or "") for text in sections.values())
    return f"{result.get('pmcid') or 'Article'} · {_join(list(sections), 4)} · {chars:,} chars"


def _summarize_spec(result: dict) -> str:
    passages = result.get("passages") or []
    if not passages:
        return result.get("note") or "No matching passage"
    return f"{len(passages)} passages: " + _join([p.get("section") or "?" for p in passages], 3)


def _summarize_ontology(result: dict) -> str:
    if result.get("ok") is False:
        return result.get("error") or result.get("hint") or f"No match for '{result.get('query')}'"
    if result.get("reserved"):
        return result.get("note") or "Reserved SDRF value"
    terms = result.get("terms") or []
    if not terms:
        return f"No match for '{result.get('query')}'"
    return f"{len(terms)} hits: " + _join([f"{t.get('label')} ({t.get('id')})" for t in terms], 3)


def _summarize_verify(result: dict) -> str:
    accession = result.get("accession")
    if not result.get("valid"):
        return f"{accession} invalid: {result.get('reason') or 'not found in OLS'}"
    label = (result.get("term") or {}).get("label")
    if result.get("labelMatches") is False:
        return f"{accession} is '{label}' - {result.get('reason') or 'label mismatch'}"
    return f"{accession} = {label}"


def _summarize_cell_line(result: dict) -> str:
    matches = result.get("matches") or []
    if not matches:
        return f"No cell-line match for '{result.get('query')}'"
    top = matches[0]
    accession = top.get("cellosaurusAccession") or "no CVCL"
    return (
        f"{len(matches)} hit(s): {top.get('cellLine')} ({accession})"
        + (f" · {result.get('retrieval')}" if result.get("retrieval") else "")
    )


def _summarize_cellosaurus_verify(result: dict) -> str:
    accession = result.get("accession")
    if not result.get("valid"):
        return f"{accession} invalid: {result.get('reason') or 'not in cell-line DB'}"
    term = result.get("term") or {}
    name = term.get("cellosaurusName") or term.get("cellLine")
    if result.get("labelMatches") is False:
        return f"{accession} is '{name}' - {result.get('reason') or 'label mismatch'}"
    return f"{accession} = {name}"


def _summarize_templates(result: dict) -> str:
    layers = result.get("layers") or {}
    return " · ".join(f"{layer}: {len(items)}" for layer, items in layers.items()) or "No templates"


def _summarize_template_columns(result: dict) -> str:
    required = result.get("requiredColumns") or []
    columns = result.get("columns") or []
    return (
        f"{result.get('name')} ({result.get('layer') or 'unknown layer'}) · "
        f"{len(required)} required of {len(columns)} columns"
    )


def _summarize_validation(result: dict) -> str:
    if result.get("valid"):
        warnings = result.get("warnings") or []
        return "Combination is valid" + (f" · {len(warnings)} warning(s)" if warnings else "")
    return "Invalid: " + _join(result.get("errors") or ["unknown reason"], 2)


def _summarize_pdf_check(result: dict) -> str:
    if not result.get("reachable"):
        return f"Not reachable: {result.get('error') or 'unknown error'}"
    kilobytes = int(result.get("bytes") or 0) // 1024
    kind = "PDF" if result.get("isPdf") else (result.get("contentType") or "unknown type")
    return f"Reachable · {kind} · {kilobytes:,} KB"


def _summarize_parse(result: dict) -> str:
    if not result.get("ok"):
        return f"Parse failed: {result.get('error') or 'unknown error'}"
    return (
        f"Parsed with {result.get('parser')} · {int(result.get('charCount') or 0):,} chars · "
        f"{_join(result.get('availableSections') or [], 4)}"
    )


def _summarize_documents(result: dict) -> str:
    documents = result.get("documents") or []
    if not documents:
        return "No documents uploaded in this session"
    names = [d.get("fileName") or d.get("documentId") for d in documents]
    return f"{len(documents)} document(s): " + _join(names, 3)


def _summarize_read_document(result: dict) -> str:
    if not result.get("ok"):
        return f"Could not read: {result.get('error') or 'unknown error'}"
    sections = result.get("sections") or {}
    chars = sum(len(text or "") for text in sections.values())
    return f"{result.get('fileName')} · {_join(list(sections), 4)} · {chars:,} chars"


# ---------------------------------------------------------------------- schemas

TOOLS: list[dict[str, Any]] = [
    {
        "declaration": {
            "name": "get_pride_dataset",
            "description": (
                "Fetch PRIDE Archive metadata and raw file names for a ProteomeXchange "
                "accession. Always the first step when the user gives a PXD identifier."
            ),
            "parameters": {
                "type": "object",
                "properties": {"accession": {"type": "string", "description": "e.g. PXD012345"}},
                "required": ["accession"],
            },
        },
        "handler": _get_dataset,
        "status": "Fetching PRIDE metadata",
        "title": "PRIDE dataset",
        "summarize": _summarize_dataset,
    },
    {
        "declaration": {
            "name": "get_pride_raw_files",
            "description": "Fetch only the raw/acquisition file names for a ProteomeXchange accession.",
            "parameters": {
                "type": "object",
                "properties": {
                    "accession": {"type": "string"},
                    "limit": {"type": "integer", "description": "Max file names to return (default 400)."},
                },
                "required": ["accession"],
            },
        },
        "handler": _get_raw_files,
        "status": "Listing raw files",
        "title": "PRIDE raw files",
        "summarize": _summarize_raw_files,
    },
    {
        "declaration": {
            "name": "find_publication",
            "description": (
                "Resolve a paper by PMID, DOI, or title through Europe PMC. Reports whether "
                "open full text exists and which PDF URLs are available."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "pmid": {"type": "string"},
                    "doi": {"type": "string"},
                    "title": {"type": "string"},
                },
            },
        },
        "handler": _find_publication,
        "status": "Looking up the publication",
        "title": "Publication lookup",
        "summarize": _summarize_publication,
    },
    {
        "declaration": {
            "name": "get_publication_full_text",
            "description": "Fetch cleaned Europe PMC full text sections for an open-access PMC article.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pmcid": {"type": "string", "description": "e.g. PMC1234567"},
                    "sections": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional subset, e.g. ['methods','results'].",
                    },
                },
                "required": ["pmcid"],
            },
        },
        "handler": _get_full_text,
        "status": "Reading the paper",
        "title": "Paper full text",
        "summarize": _summarize_full_text,
    },
    {
        "declaration": {
            "name": "check_pdf_url",
            "description": "Check whether a candidate PDF URL is downloadable before parsing it.",
            "parameters": {
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"],
            },
        },
        "handler": _check_pdf_reachable,
        "status": "Checking the PDF link",
        "title": "PDF link check",
        "summarize": _summarize_pdf_check,
    },
    {
        "declaration": {
            "name": "parse_pdf_url",
            "description": (
                "Download a PDF and parse it with MinerU. On setup, prefer asking the user to "
                "upload via the paperclip instead of calling this. Use only when the user "
                "explicitly asks to fetch a known free PDF URL."
            ),
            "parameters": {
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"],
            },
        },
        "handler": _parse_pdf_url,
        "status": "Parsing the PDF with MinerU",
        "title": "PDF parse (MinerU)",
        "summarize": _summarize_parse,
    },
    {
        "declaration": {
            "name": "list_documents",
            "description": "List papers the user has uploaded or that were parsed in this session.",
            "parameters": {"type": "object", "properties": {}},
        },
        "handler": _list_documents,
        "status": "Checking uploaded documents",
        "title": "Uploaded documents",
        "summarize": _summarize_documents,
    },
    {
        "declaration": {
            "name": "read_document",
            "description": (
                "Read sections of a parsed document. Prefer sections ['methods','results'] for "
                "SDRF annotation evidence."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "documentId": {"type": "string"},
                    "sections": {"type": "array", "items": {"type": "string"}},
                    "maxChars": {"type": "integer"},
                },
                "required": ["documentId"],
            },
        },
        "handler": _read_document,
        "status": "Reading the paper",
        "title": "Document sections",
        "summarize": _summarize_read_document,
    },
    {
        "declaration": {
            "name": "search_specification",
            "description": (
                "Search the SDRF-Proteomics specification knowledge base. Use this for any "
                "question about format rules, column names, reserved words, or cell value syntax, "
                "and to double-check a rule before proposing a value."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "k": {"type": "integer", "description": "Number of passages (default 5)."},
                },
                "required": ["query"],
            },
        },
        "handler": _search_specification,
        "status": "Searching the SDRF specification",
        "title": "SDRF specification",
        "summarize": _summarize_spec,
    },
    {
        "declaration": {
            "name": "search_ontology",
            "description": (
                "Search EBI OLS for ontology terms for an SDRF column. Required before proposing "
                "any ontology-backed characteristic (required or recommended), e.g. organism, "
                "disease, culture medium. Pass column + a short query (not a full recipe). "
                "For cell lines / Cellosaurus accessions (CVCL_…), use search_cell_line instead."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Short candidate value, e.g. 'RPMI 1640' or 'Homo sapiens'.",
                    },
                    "column": {
                        "type": "string",
                        "description": "SDRF column, e.g. 'characteristics[culture medium]' — selects ontologies.",
                    },
                    "ontologies": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional override; normally omit and let column mapping choose.",
                    },
                    "limit": {"type": "integer"},
                },
                "required": ["query", "column"],
            },
        },
        "handler": _search_ontology,
        "status": "Verifying ontology terms",
        "title": "Ontology search",
        "summarize": _summarize_ontology,
    },
    {
        "declaration": {
            "name": "verify_ontology_term",
            "description": (
                "Confirm an OLS CURIE (e.g. UNIMOD:4, MS:1000031) exists and matches a label. "
                "Do NOT use for Cellosaurus CVCL_… ids — use verify_cellosaurus_accession."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "accession": {"type": "string", "description": "e.g. UNIMOD:4"},
                    "expectedLabel": {"type": "string"},
                },
                "required": ["accession"],
            },
        },
        "handler": _verify_ontology_term,
        "status": "Verifying an accession",
        "title": "Accession check",
        "summarize": _summarize_verify,
    },
    {
        "declaration": {
            "name": "search_cell_line",
            "description": (
                "Search the local Cellosaurus / cell-line knowledge base (curated TSV + vector "
                "index). Use this for characteristics[cell line] and characteristics[cellosaurus "
                "accession]. Returns official name, CVCL_ accession, disease, organism part, "
                "sex, age, and synonyms."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Cell-line name, synonym, or CVCL_ accession.",
                    },
                    "limit": {"type": "integer"},
                },
                "required": ["query"],
            },
        },
        "handler": _search_cell_line,
        "status": "Searching cell-line DB",
        "title": "Cell-line search",
        "summarize": _summarize_cell_line,
    },
    {
        "declaration": {
            "name": "verify_cellosaurus_accession",
            "description": (
                "Confirm a Cellosaurus accession (CVCL_…) exists in the local cell-line database "
                "and optionally matches an expected cell-line name."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "accession": {"type": "string", "description": "e.g. CVCL_0030"},
                    "expectedLabel": {"type": "string"},
                },
                "required": ["accession"],
            },
        },
        "handler": _verify_cellosaurus,
        "status": "Verifying Cellosaurus id",
        "title": "Cellosaurus check",
        "summarize": _summarize_cellosaurus_verify,
    },
    {
        "declaration": {
            "name": "list_sdrf_templates",
            "description": "List SDRF templates by layer, with the wizard's selection rules.",
            "parameters": {
                "type": "object",
                "properties": {
                    "layer": {"type": "string", "enum": ["technology", "sample", "experiment"]},
                },
            },
        },
        "handler": _list_templates,
        "status": "Listing SDRF templates",
        "title": "SDRF templates",
        "summarize": _summarize_templates,
    },
    {
        "declaration": {
            "name": "get_template_columns",
            "description": "Resolve a template's inherited column list with requirement levels.",
            "parameters": {
                "type": "object",
                "properties": {"name": {"type": "string"}, "version": {"type": "string"}},
                "required": ["name"],
            },
        },
        "handler": _get_template_columns,
        "status": "Reading template columns",
        "title": "Template columns",
        "summarize": _summarize_template_columns,
    },
    {
        "declaration": {
            "name": "validate_template_combination",
            "description": "Validate a technology + sample + experiment template combination.",
            "parameters": {
                "type": "object",
                "properties": {
                    "technology": {"type": "string"},
                    "sample": {"type": "string"},
                    "experiments": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "handler": _validate_templates,
        "status": "Validating template selection",
        "title": "Template validation",
        "summarize": _summarize_validation,
    },
]

_BY_NAME = {tool["declaration"]["name"]: tool for tool in TOOLS}


def openai_tool_specs() -> list[dict]:
    return [{"type": "function", "function": tool["declaration"]} for tool in TOOLS]


def status_for(name: str) -> str:
    tool = _BY_NAME.get(name)
    return tool["status"] if tool else f"Running {name}"


def title_for(name: str) -> str:
    """Short display name for the tool row in the panel."""
    tool = _BY_NAME.get(name)
    return tool.get("title") or name if tool else name


def describe(name: str, result: Any) -> tuple[str, bool]:
    """One-line gist of a tool result plus whether it needs the user's attention."""
    if not isinstance(result, dict):
        return _truncate_summary(str(result)), True

    error = result.get("error")
    if error:
        return _truncate_summary(f"Failed: {str(error).splitlines()[0]}"), False

    summarize = (_BY_NAME.get(name) or {}).get("summarize")
    if not summarize:
        return _truncate_summary(json.dumps(result, ensure_ascii=False, default=str)), True

    try:
        summary = summarize(result)
    except Exception:  # noqa: BLE001 - a broken summary must not kill the turn
        summary = ""
    return _truncate_summary(summary or "Completed"), _result_ok(result)


def _result_ok(result: dict) -> bool:
    """False for outcomes the user should look at: not found, invalid, unparsable."""
    return not any(result.get(key) is False for key in ("ok", "reachable", "valid", "found"))


def _truncate_summary(text: str) -> str:
    collapsed = " ".join((text or "").split())
    return collapsed if len(collapsed) <= MAX_SUMMARY_CHARS else f"{collapsed[:MAX_SUMMARY_CHARS]}…"


async def dispatch(name: str, raw_arguments: str | dict, session_id: str) -> str:
    """Execute a tool and return a JSON string for the model."""
    tool = _BY_NAME.get(name)
    if not tool:
        return json.dumps({"error": f"Unknown tool '{name}'."})

    if isinstance(raw_arguments, str):
        try:
            args = json.loads(raw_arguments or "{}")
        except json.JSONDecodeError as error:
            return json.dumps({"error": f"Arguments were not valid JSON: {error}"})
    else:
        args = raw_arguments or {}

    try:
        result = await tool["handler"](args, session_id)
    except KeyError as error:
        result = {"error": f"Missing required argument: {error}"}
    except (ToolHttpError, PdfParseError) as error:
        result = {"error": str(error)}
    except Exception as error:  # noqa: BLE001 - a failing tool must not kill the turn
        result = {"error": f"{type(error).__name__}: {error}"}

    payload = json.dumps(result, ensure_ascii=False, default=str)
    if len(payload) > MAX_RESULT_CHARS:
        payload = payload[:MAX_RESULT_CHARS] + '..."[truncated]"'
    return payload
