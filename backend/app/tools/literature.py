"""Europe PMC literature lookup and JATS full-text extraction.

Mirrors the approach of bigbio/sdrf-skills `scripts/europepmc_fulltext.py`:
resolve a PMID/DOI to a record, pull the JATS full text when Europe PMC hosts
it, and convert the noisy XML into clean per-section text. When the article is
not open access the caller is told which PDF URLs exist so it can either
download one or ask the user to upload the paper.
"""

from __future__ import annotations

import re

from .http import ToolHttpError, get_json, get_text

EPMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest"

SECTION_ALIASES = {
    "abstract": "abstract",
    "introduction": "introduction",
    "background": "introduction",
    "methods": "methods",
    "method": "methods",
    "materials and methods": "methods",
    "material and methods": "methods",
    "experimental procedures": "methods",
    "experimental section": "methods",
    "results": "results",
    "results and discussion": "results",
    "discussion": "discussion",
    "conclusion": "conclusion",
    "conclusions": "conclusion",
}

# Sections that carry SDRF-relevant detail, in priority order.
PRIORITY_SECTIONS = ("methods", "results", "abstract", "introduction", "discussion", "conclusion")
MAX_SECTION_CHARS = 20000

# Front/back matter that never contains sample metadata.
SKIP_SECTIONS = {
    "references", "acknowledgements", "acknowledgments", "footnotes",
    "conflicts of interest", "conflict of interest", "competing interests",
    "associated data", "supplementary material", "supporting information",
    "author contributions", "funding", "abbreviations", "data availability",
}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _normalize_section(title: str) -> str:
    lowered = _clean(title).lower().rstrip(".")
    lowered = re.sub(r"^[\d.\s]+", "", lowered)
    for alias, canonical in SECTION_ALIASES.items():
        if lowered == alias or lowered.startswith(alias):
            return canonical
    return lowered or "other"


async def lookup_publication(pmid: str | None = None, doi: str | None = None, title: str | None = None) -> dict:
    """Resolve an article and report how its full text can be obtained."""
    if pmid:
        query = f"EXT_ID:{re.sub(r'[^0-9]', '', str(pmid))}"
    elif doi:
        query = f'DOI:"{doi.strip()}"'
    elif title:
        query = f'TITLE:"{_clean(title)}"'
    else:
        raise ToolHttpError("Provide a pmid, doi, or title to look up a publication.")

    payload = await get_json(
        f"{EPMC_BASE}/search",
        params={"query": query, "format": "json", "resultType": "core", "pageSize": 1},
    )
    results = payload.get("resultList", {}).get("result", [])
    if not results:
        return {
            "found": False,
            "query": query,
            "message": "No Europe PMC record matched this identifier.",
            "nextStep": (
                "Call list_documents; if empty, ask the user to upload the paper PDF "
                "through the panel's paperclip button, and tell them that if they do "
                "not upload one you will continue annotating from PRIDE metadata alone "
                "— then stop without proposing templates yet."
            ),
        }

    record = results[0]
    pdf_urls: list[str] = []
    for entry in (record.get("fullTextUrlList") or {}).get("fullTextUrl", []):
        if entry.get("documentStyle") == "pdf" and entry.get("url"):
            pdf_urls.append(entry["url"])

    pmcid = record.get("pmcid")
    is_open_access = record.get("isOpenAccess") == "Y"
    # inEPMC=Y only guarantees the abstract; the JATS endpoint needs the OA subset.
    open_full_text = bool(pmcid) and is_open_access

    return {
        "found": True,
        "pmid": record.get("pmid"),
        "pmcid": pmcid,
        "doi": record.get("doi"),
        "title": _clean(record.get("title")),
        "journal": ((record.get("journalInfo") or {}).get("journal") or {}).get("title"),
        "year": record.get("pubYear"),
        "isOpenAccess": is_open_access,
        "fullTextAvailable": open_full_text,
        "abstract": _clean(record.get("abstractText"))[:4000],
        "pdfUrls": pdf_urls[:5],
        "url": f"https://europepmc.org/article/{record.get('source', 'MED')}/{record.get('id')}",
        "nextStep": _next_step(open_full_text, bool(pmcid), bool(pdf_urls)),
    }


def _next_step(open_full_text: bool, has_pmcid: bool, has_pdf: bool) -> str:
    # Prefer a MinerU-parsed session document so later steps can call read_document.
    if has_pdf:
        return (
            "PDF link(s) are available in pdfUrls. Call check_pdf_url on one URL, then "
            "parse_pdf_url to download and MinerU-parse it into the session. Then call "
            "read_document with that documentId (methods/results). Do NOT use "
            "get_publication_full_text as the primary paper source — OA XML is not a "
            "session document and later read_document calls will fail."
        )
    if open_full_text:
        return (
            "Open full text exists in Europe PMC but no pdfUrls were returned. "
            "Call list_documents; if empty, ask the user to upload the paper PDF via "
            "the panel paperclip (required for MinerU session documents), then STOP "
            "without proposing templates. Do not rely on get_publication_full_text alone."
        )
    if has_pmcid:
        return (
            "The article is in Europe PMC but outside the open-access subset / no PDF "
            "URL. Call list_documents; if empty, ask the user to upload the paper PDF "
            "through the panel's paperclip button and stop — do not propose templates yet."
        )
    return (
        "No open full text and no PDF URL available. "
        "Call list_documents; if empty, ask the user to upload the "
        "paper PDF through the panel's paperclip button and stop — do not propose "
        "templates yet."
    )


async def fetch_full_text(pmcid: str, sections: list[str] | None = None) -> dict:
    """Fetch and clean the Europe PMC JATS full text for a PMC article."""
    normalized = pmcid.strip().upper()
    if not normalized.startswith("PMC"):
        normalized = f"PMC{re.sub(r'[^0-9]', '', normalized)}"

    try:
        xml = await get_text(f"{EPMC_BASE}/{normalized}/fullTextXML", timeout=60.0)
    except ToolHttpError as error:
        raise ToolHttpError(
            f"Europe PMC has no open full text for {normalized} ({error}). "
            "Ask the user to upload the paper PDF instead."
        ) from error

    parsed = parse_jats(xml)
    wanted = [s.lower() for s in sections] if sections else None
    selected = {
        name: text for name, text in parsed["sections"].items() if not wanted or name in wanted
    }
    if not selected:
        selected = parsed["sections"]

    return {
        "pmcid": normalized,
        "title": parsed["title"],
        "sections": {name: text[:MAX_SECTION_CHARS] for name, text in selected.items()},
        "availableSections": list(parsed["sections"].keys()),
        "url": f"https://europepmc.org/article/PMC/{normalized}",
    }


def parse_jats(xml: str) -> dict:
    """Convert JATS XML into `{title, sections: {name: text}}`."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(xml, "lxml-xml")

    for tag in soup.find_all(["xref", "table-wrap", "fig", "graphic", "ref-list", "back"]):
        tag.decompose()

    title_tag = soup.find("article-title")
    title = _clean(title_tag.get_text(" ") if title_tag else "")

    sections: dict[str, list[str]] = {}

    abstract = soup.find("abstract")
    if abstract:
        sections.setdefault("abstract", []).append(_clean(abstract.get_text(" ")))

    body = soup.find("body")
    if body:
        top_sections = body.find_all("sec", recursive=False) or body.find_all("sec")
        for section in top_sections:
            title_node = section.find("title")
            name = _normalize_section(title_node.get_text(" ") if title_node else "other")
            if name in SKIP_SECTIONS:
                continue
            text = _clean(section.get_text(" "))
            if text:
                sections.setdefault(name, []).append(text)
        if not top_sections:
            sections.setdefault("body", []).append(_clean(body.get_text(" ")))

    merged = {name: "\n\n".join(parts) for name, parts in sections.items() if any(parts)}
    ordered = {name: merged[name] for name in PRIORITY_SECTIONS if name in merged}
    ordered.update({name: text for name, text in merged.items() if name not in ordered})
    return {"title": title, "sections": ordered}
