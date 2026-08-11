from app.rag.chunker import chunk_document, html_to_text, is_boilerplate, normalize_text, slugify

SAMPLE = """Source URL: https://sdrf.quantms.org/specification.html
Title: SDRF

# SDRF-Proteomics

Table of Contents

* 1\\. Status
* 2\\. Abstract
* 3\\. Motivation
* 4\\. Structure
* 5\\. Format

## 5\\. The SDRF-Proteomics Format

The format is a tab-delimited table where each row describes one data file.
Columns are grouped into source, characteristics, comment and factor value blocks.

### 5.3\\. Reserved words

The following reserved words are allowed in any column: `not available`,
`not applicable`, `anonymized`, `pooled`. Use them instead of leaving a cell empty.
"""


def test_boilerplate_and_toc_are_dropped():
    chunks = chunk_document(SAMPLE, source_url="https://sdrf.quantms.org/specification.html")
    titles = [c.title for c in chunks]

    assert "Introduction" not in titles, "site navigation header should be dropped"
    assert not any("Table of Contents" in c.text for c in chunks)
    assert "Reserved words" in titles


def test_chunk_carries_section_number_and_anchor():
    chunks = chunk_document(SAMPLE, source_url="https://sdrf.quantms.org/specification.html")
    reserved = next(c for c in chunks if c.title == "Reserved words")

    assert reserved.section_number == "5.3"
    assert reserved.anchor == "https://sdrf.quantms.org/specification.html#53-reserved-words"
    assert reserved.heading_path == ["SDRF-Proteomics", "The SDRF-Proteomics Format", "Reserved words"]
    assert "not applicable" in reserved.text


def test_embed_text_prepends_heading_path():
    chunks = chunk_document(SAMPLE)
    reserved = next(c for c in chunks if c.title == "Reserved words")
    assert reserved.embed_text.startswith("SDRF-Proteomics > The SDRF-Proteomics Format > Reserved words")


def test_normalize_text_unescapes_column_names():
    assert normalize_text(r"comment\[modification parameters\]") == "comment[modification parameters]"
    assert normalize_text("zero\u200bwidth") == "zerowidth"


def test_is_boilerplate_detects_link_lists():
    toc = "\n".join(f"* {i}\\. Section {i}" for i in range(1, 9))
    assert is_boilerplate(toc)
    assert not is_boilerplate("A paragraph of real specification prose about columns.")


def test_slugify_matches_site_anchor_style():
    assert slugify("5.3\\. Reserved words") == "53-reserved-words"


def test_html_to_text_preserves_headings_and_tables():
    html = """
    <html><body><main>
      <h2>8.1. CV Term Format</h2>
      <p>Use NT, AC, TA and MT keys.</p>
      <table><tr><th>Key</th><th>Meaning</th></tr><tr><td>NT</td><td>Name</td></tr></table>
    </main></body></html>
    """
    text = html_to_text(html)
    assert "## 8.1. CV Term Format" in text
    assert "NT | Name" in text
