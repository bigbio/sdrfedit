"""Load curated cell-line TSV tables into search records.

Sources (under the repo's sdrf-proteomics/ folder by default):
  - cl-annotations-db.tsv  — Cellosaurus accessions + sample metadata
  - ai-synonyms.tsv        — extra aliases used in AI / PRIDE naming
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class CellLineRecord:
    """One searchable cell-line entry."""

    cell_line: str
    cellosaurus_name: str
    cellosaurus_accession: str
    organism: str = ""
    organism_part: str = ""
    sampling_site: str = ""
    age: str = ""
    developmental_stage: str = ""
    sex: str = ""
    ancestry_category: str = ""
    disease: str = ""
    cell_type: str = ""
    material_type: str = ""
    synonyms: list[str] = field(default_factory=list)
    curated: str = ""
    bto_cell_line: str = ""

    @property
    def has_accession(self) -> bool:
        value = (self.cellosaurus_accession or "").strip().lower()
        return bool(value) and value not in {"not available", "na", "n/a", "nan"}

    def embed_text(self) -> str:
        """Text fed to the embedding model / lexical index."""
        alias = "; ".join(self.synonyms)
        parts = [
            f"cell line: {self.cell_line}",
            f"cellosaurus name: {self.cellosaurus_name}" if self.cellosaurus_name else "",
            f"cellosaurus accession: {self.cellosaurus_accession}" if self.has_accession else "",
            f"synonyms: {alias}" if alias else "",
            f"organism: {self.organism}" if self.organism else "",
            f"organism part: {self.organism_part}" if self.organism_part else "",
            f"sampling site: {self.sampling_site}" if self.sampling_site else "",
            f"disease: {self.disease}" if self.disease else "",
            f"cell type: {self.cell_type}" if self.cell_type else "",
            f"sex: {self.sex}" if self.sex else "",
            f"age: {self.age}" if self.age else "",
            f"developmental stage: {self.developmental_stage}" if self.developmental_stage else "",
            f"ancestry: {self.ancestry_category}" if self.ancestry_category else "",
            f"material type: {self.material_type}" if self.material_type else "",
            f"bto: {self.bto_cell_line}" if self.bto_cell_line and self.bto_cell_line.lower() != "not available" else "",
        ]
        return "\n".join(part for part in parts if part)

    def to_dict(self) -> dict:
        return {
            "cellLine": self.cell_line,
            "cellosaurusName": _na(self.cellosaurus_name),
            "cellosaurusAccession": self.cellosaurus_accession if self.has_accession else None,
            "organism": _na(self.organism),
            "organismPart": _na(self.organism_part),
            "samplingSite": _na(self.sampling_site),
            "age": _na(self.age),
            "developmentalStage": _na(self.developmental_stage),
            "sex": _na(self.sex),
            "ancestryCategory": _na(self.ancestry_category),
            "disease": _na(self.disease),
            "cellType": _na(self.cell_type),
            "materialType": _na(self.material_type) or "cell line",
            "synonyms": self.synonyms,
            "btoCellLine": _na(self.bto_cell_line),
            "curated": self.curated or None,
        }

    @classmethod
    def from_dict(cls, raw: dict) -> "CellLineRecord":
        return cls(
            cell_line=raw.get("cellLine") or raw.get("cell_line") or "",
            cellosaurus_name=raw.get("cellosaurusName") or raw.get("cellosaurus_name") or "",
            cellosaurus_accession=raw.get("cellosaurusAccession") or raw.get("cellosaurus_accession") or "",
            organism=raw.get("organism") or "",
            organism_part=raw.get("organismPart") or raw.get("organism_part") or "",
            sampling_site=raw.get("samplingSite") or raw.get("sampling_site") or "",
            age=raw.get("age") or "",
            developmental_stage=raw.get("developmentalStage") or raw.get("developmental_stage") or "",
            sex=raw.get("sex") or "",
            ancestry_category=raw.get("ancestryCategory") or raw.get("ancestry_category") or "",
            disease=raw.get("disease") or "",
            cell_type=raw.get("cellType") or raw.get("cell_type") or "",
            material_type=raw.get("materialType") or raw.get("material_type") or "",
            synonyms=list(raw.get("synonyms") or []),
            curated=raw.get("curated") or "",
            bto_cell_line=raw.get("btoCellLine") or raw.get("bto_cell_line") or "",
        )


def _na(value: str | None) -> str | None:
    text = (value or "").strip()
    if not text or text.lower() in {"not available", "na", "n/a", "nan"}:
        return None
    return text


def _split_synonyms(raw: str) -> list[str]:
    if not raw or raw.strip().lower() in {"not available", "nan", "na", "n/a"}:
        return []
    parts: list[str] = []
    for chunk in raw.replace("|", ";").split(";"):
        name = chunk.strip()
        if name and name.lower() not in {"nan", "n", "not available"}:
            parts.append(name)
    return parts


def load_synonym_map(path: Path) -> dict[str, list[str]]:
    """Map canonical cell-line name (lower) → extra synonyms."""
    if not path.is_file():
        return {}
    mapping: dict[str, list[str]] = {}
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            name = (row.get("cell line") or "").strip()
            if not name:
                continue
            aliases = _split_synonyms(row.get("synonyms") or "")
            key = name.casefold()
            mapping.setdefault(key, [])
            for alias in aliases:
                if alias.casefold() != key and alias not in mapping[key]:
                    mapping[key].append(alias)
    return mapping


def load_cellline_records(db_path: Path, synonyms_path: Path | None = None) -> list[CellLineRecord]:
    """Parse the curated TSV tables into records."""
    if not db_path.is_file():
        raise FileNotFoundError(f"Cell-line database not found: {db_path}")

    extra = load_synonym_map(synonyms_path) if synonyms_path else {}
    records: list[CellLineRecord] = []

    with db_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            name = (row.get("cell line") or "").strip()
            if not name:
                continue
            synonyms = _split_synonyms(row.get("synonyms") or "")
            for alias in extra.get(name.casefold(), []):
                if alias not in synonyms and alias.casefold() != name.casefold():
                    synonyms.append(alias)

            records.append(
                CellLineRecord(
                    cell_line=name,
                    cellosaurus_name=(row.get("cellosaurus name") or "").strip(),
                    cellosaurus_accession=(row.get("cellosaurus accession") or "").strip(),
                    organism=(row.get("organism") or "").strip(),
                    organism_part=(row.get("organism part") or "").strip(),
                    sampling_site=(row.get("sampling site") or "").strip(),
                    age=(row.get("age") or "").strip(),
                    developmental_stage=(row.get("developmental stage") or "").strip(),
                    sex=(row.get("sex") or "").strip(),
                    ancestry_category=(row.get("ancestry category") or "").strip(),
                    disease=(row.get("disease") or "").strip(),
                    cell_type=(row.get("cell type") or "").strip(),
                    material_type=(row.get("Material type") or row.get("material type") or "").strip(),
                    synonyms=synonyms,
                    curated=(row.get("curated") or "").strip(),
                    bto_cell_line=(row.get("bto cell line") or "").strip(),
                )
            )

    return records


def normalize_cellosaurus_accession(value: str) -> str | None:
    """Accept CVCL_0030 or CVCL:0030 → CVCL_0030."""
    text = (value or "").strip().upper().replace(" ", "")
    if not text:
        return None
    if text.startswith("CVCL:"):
        text = "CVCL_" + text.split(":", 1)[1]
    if text.startswith("CELLSAURUS:"):
        text = "CVCL_" + text.split(":", 1)[1]
    if not text.startswith("CVCL_"):
        return None
    suffix = text[5:]
    if not suffix.isalnum():
        return None
    return f"CVCL_{suffix}"
