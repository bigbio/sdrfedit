"""Split the SDRF specification into retrievable chunks.

The upstream page (https://sdrf.quantms.org/specification.html) is a single long
document with numbered headings. Both raw HTML and an already text-converted
version are accepted so the index can be rebuilt offline from a bundled copy.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
# Headings arrive as "5.1\. Format rules" after HTML→text conversion.
NUMBER_PREFIX_RE = re.compile(r"^([\d.]+)\\?\.\s*")

MAX_CHARS = 2400
MIN_CHARS = 120

TOC_LINE_RE = re.compile(r"^\s*[*-]\s+\d+\\?\.")
NAV_MARKERS = ("Source URL:", "Table of Contents")


@dataclass
class SpecChunk:
    chunk_id: str
    title: str
    heading_path: list[str]
    section_number: str
    anchor: str
    text: str
    tokens: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "chunk_id": self.chunk_id,
            "title": self.title,
            "heading_path": self.heading_path,
            "section_number": self.section_number,
            "anchor": self.anchor,
            "text": self.text,
        }

    @staticmethod
    def from_dict(raw: dict) -> "SpecChunk":
        return SpecChunk(
            chunk_id=raw["chunk_id"],
            title=raw.get("title", ""),
            heading_path=raw.get("heading_path", []),
            section_number=raw.get("section_number", ""),
            anchor=raw.get("anchor", ""),
            text=raw.get("text", ""),
        )

    @property
    def embed_text(self) -> str:
        """Heading context is prepended so short rule snippets stay searchable."""
        path = " > ".join(self.heading_path)
        return f"{path}\n\n{self.text}" if path else self.text


def html_to_text(html: str) -> str:
    """Convert the specification HTML into heading-annotated plain text."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "header", "footer"]):
        tag.decompose()

    root = soup.find("main") or soup.find("article") or soup.body or soup
    lines: list[str] = []

    for node in root.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "pre", "table"]):
        name = node.name
        if name.startswith("h") and len(name) == 2 and name[1].isdigit():
            level = int(name[1])
            text = node.get_text(" ", strip=True)
            if text:
                lines.append("")
                lines.append(f"{'#' * level} {text}")
                lines.append("")
        elif name == "table":
            lines.append(_table_to_text(node))
            lines.append("")
        elif name == "pre":
            lines.append("```")
            lines.append(node.get_text("\n", strip=True))
            lines.append("```")
            lines.append("")
        elif name == "li":
            text = node.get_text(" ", strip=True)
            if text:
                lines.append(f"- {text}")
        else:
            text = node.get_text(" ", strip=True)
            if text:
                lines.append(text)
                lines.append("")

    return "\n".join(lines)


def _table_to_text(table) -> str:
    rows: list[str] = []
    for tr in table.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
        if any(cells):
            rows.append(" | ".join(cells))
    return "\n".join(rows)


def slugify(text: str) -> str:
    slug = text.strip().lower()
    slug = slug.replace("\\", "")
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug).strip("-")
    return slug


ESCAPE_RE = re.compile(r"\\([\[\]().*_`#+\-!|])")
ZERO_WIDTH_RE = re.compile(r"[\u200b\u200c\u200d\ufeff\u00ad]")


def normalize_text(text: str) -> str:
    """Undo markdown escaping so column names like `comment[label]` stay intact."""
    return ZERO_WIDTH_RE.sub("", ESCAPE_RE.sub(r"\1", text))


def chunk_document(text: str, *, source_url: str = "") -> list[SpecChunk]:
    """Split heading-annotated text into chunks, one per (sub)section."""
    sections = _split_sections(normalize_text(text))
    chunks: list[SpecChunk] = []

    for section in sections:
        body = section["body"].strip()
        if len(body) < MIN_CHARS and not section["heading_path"]:
            continue
        if is_boilerplate(body):
            continue
        for part_index, part in enumerate(_split_long(body)):
            if not part.strip():
                continue
            title = section["heading_path"][-1] if section["heading_path"] else "Introduction"
            anchor = slugify(f"{section['section_number']} {title}") or slugify(title)
            suffix = f"-{part_index}" if part_index else ""
            chunks.append(
                SpecChunk(
                    chunk_id=f"{anchor or 'intro'}{suffix}",
                    title=title,
                    heading_path=section["heading_path"],
                    section_number=section["section_number"],
                    anchor=f"{source_url}#{anchor}" if source_url else f"#{anchor}",
                    text=part.strip(),
                )
            )

    return chunks


def is_boilerplate(body: str) -> bool:
    """Drop the site navigation header and the table of contents.

    Both duplicate every heading in the document, which otherwise dominates
    lexical retrieval for any query phrased with section keywords.
    """
    if not body:
        return True
    if any(body.lstrip().startswith(marker) for marker in NAV_MARKERS):
        return True

    lines = [line for line in body.splitlines() if line.strip()]
    if len(lines) >= 5:
        toc_lines = sum(1 for line in lines if TOC_LINE_RE.match(line))
        if toc_lines / len(lines) > 0.5:
            return True
    return False


def _split_sections(text: str) -> list[dict]:
    sections: list[dict] = []
    stack: list[tuple[int, str]] = []
    current = {"heading_path": [], "section_number": "", "body": ""}
    buffer: list[str] = []

    def flush() -> None:
        current["body"] = "\n".join(buffer).strip()
        if current["body"] or current["heading_path"]:
            sections.append(dict(current))
        buffer.clear()

    for line in text.splitlines():
        match = HEADING_RE.match(line.strip())
        if not match:
            buffer.append(line)
            continue

        flush()
        level = len(match.group(1))
        raw_title = match.group(2).strip()
        number_match = NUMBER_PREFIX_RE.match(raw_title)
        section_number = number_match.group(1).rstrip(".") if number_match else ""
        title = NUMBER_PREFIX_RE.sub("", raw_title).strip() or raw_title

        while stack and stack[-1][0] >= level:
            stack.pop()
        stack.append((level, title))

        current = {
            "heading_path": [t for _, t in stack],
            "section_number": section_number,
            "body": "",
        }

    flush()
    return sections


def _split_long(body: str) -> list[str]:
    """Break oversized sections on paragraph boundaries."""
    if len(body) <= MAX_CHARS:
        return [body]

    parts: list[str] = []
    current: list[str] = []
    size = 0
    for paragraph in body.split("\n\n"):
        piece = paragraph.strip()
        if not piece:
            continue
        if size + len(piece) > MAX_CHARS and current:
            parts.append("\n\n".join(current))
            current = []
            size = 0
        current.append(piece)
        size += len(piece)
    if current:
        parts.append("\n\n".join(current))
    return parts
