"""Cell-line knowledge base: TSV load, search, Cellosaurus verification."""

import asyncio

import pytest

from app.celllines.loader import load_cellline_records, normalize_cellosaurus_accession
from app.celllines.store import CellLineStore
from app.config import get_settings
from app.tools import celllines as cellline_tools
from app.tools import ontology
from app.tools.http import ToolHttpError


def test_normalize_cellosaurus_accession():
    assert normalize_cellosaurus_accession("CVCL_0058") == "CVCL_0058"
    assert normalize_cellosaurus_accession("cvcl:0058") == "CVCL_0058"
    assert normalize_cellosaurus_accession("UNIMOD:4") is None


def test_load_tsv_records():
    settings = get_settings()
    records = load_cellline_records(settings.cellline_db_path, settings.cellline_synonyms_path)
    assert len(records) > 1000
    hela = next(r for r in records if r.cell_line.casefold() == "hela")
    assert hela.cellosaurus_accession == "CVCL_0030"
    assert any("HELA" in s.upper() or "HeLa" in s for s in [*hela.synonyms, hela.cell_line])


def test_store_finds_hela_and_accession():
    store = CellLineStore()
    hits = asyncio.run(store.search("HeLa", k=5))
    assert hits
    assert hits[0].record.cellosaurus_accession == "CVCL_0030"
    assert hits[0].record.cell_line.casefold() == "hela"

    by_id = store.get_by_accession("CVCL_0030")
    assert by_id is not None
    assert "hela" in by_id.cell_line.casefold()


def test_search_cell_line_tool():
    result = asyncio.run(cellline_tools.search_cell_line("A549", 5))
    assert result["matches"]
    top = result["matches"][0]
    assert top["cellosaurusAccession"] == "CVCL_0023"


def test_verify_cellosaurus_accession_tool():
    ok = asyncio.run(cellline_tools.verify_cellosaurus_accession("CVCL_0058", "HeLa S3"))
    assert ok["valid"] is True
    assert ok.get("labelMatches") is True

    with pytest.raises(ToolHttpError, match="Cellosaurus"):
        asyncio.run(ontology.verify_term("CVCL_0058"))
