"""Hybrid (embedding + lexical) store for curated cell-line records.

Mirrors the specification RAG store: vectors.npy + records.json on disk,
BM25-style lexical fallback so search still works offline.
"""

from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from ..config import Settings, get_settings
from ..rag.embeddings import EmbeddingError, embed_query
from .loader import CellLineRecord, load_cellline_records, normalize_cellosaurus_accession

RECORDS_FILE = "records.json"
VECTORS_FILE = "vectors.npy"

TOKEN_RE = re.compile(r"[a-z0-9]+(?:[_\-][a-z0-9]+)*")
STOPWORDS = {
    "the", "a", "an", "of", "for", "and", "or", "to", "in", "is", "are", "be",
    "on", "with", "cell", "line", "cells",
}

BM25_K1 = 1.4
BM25_B = 0.72
SEMANTIC_WEIGHT = 0.65


def tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    for raw in TOKEN_RE.findall((text or "").lower()):
        if raw in STOPWORDS or len(raw) < 2:
            continue
        tokens.append(raw)
        # Also emit compact forms: "u-87-mg" → "u87mg"
        compact = raw.replace("-", "").replace("_", "")
        if compact != raw and len(compact) >= 2 and compact not in STOPWORDS:
            tokens.append(compact)
    return tokens


@dataclass
class CellLineHit:
    record: CellLineRecord
    score: float
    mode: str


class CellLineStore:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._loaded = False
        self._records: list[CellLineRecord] = []
        self._vectors: np.ndarray | None = None
        self._meta: dict = {}
        self._doc_tokens: list[Counter] = []
        self._doc_lengths: list[int] = []
        self._avg_length = 0.0
        self._idf: dict[str, float] = {}
        self._by_accession: dict[str, CellLineRecord] = {}

    @property
    def index_dir(self) -> Path:
        return self._settings.cellline_index_path

    @property
    def record_count(self) -> int:
        self.load()
        return len(self._records)

    @property
    def ready(self) -> bool:
        self.load()
        return bool(self._records)

    @property
    def has_vectors(self) -> bool:
        self.load()
        return self._vectors is not None and len(self._records) == self._vectors.shape[0]

    @property
    def retrieval_mode(self) -> str:
        if not self.ready:
            return "unavailable"
        if self.has_vectors and self._settings.embeddings_configured:
            return "hybrid"
        return "lexical"

    def reload(self) -> None:
        self._loaded = False
        self.load()

    def load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        self._records = []
        self._vectors = None
        self._meta = {}
        self._by_accession = {}

        records_path = self.index_dir / RECORDS_FILE
        if records_path.is_file():
            payload = json.loads(records_path.read_text(encoding="utf-8"))
            self._meta = {k: v for k, v in payload.items() if k != "records"}
            self._records = [CellLineRecord.from_dict(raw) for raw in payload.get("records", [])]
        else:
            # Always usable from the TSV sources even before the index is built.
            try:
                self._records = load_cellline_records(
                    self._settings.cellline_db_path,
                    self._settings.cellline_synonyms_path,
                )
                self._meta = {"source": "tsv-live", "record_count": len(self._records)}
            except FileNotFoundError:
                return

        vectors_path = self.index_dir / VECTORS_FILE
        if vectors_path.is_file() and self._records:
            matrix = np.load(vectors_path)
            if matrix.shape[0] == len(self._records):
                norms = np.linalg.norm(matrix, axis=1, keepdims=True)
                norms[norms == 0] = 1.0
                self._vectors = (matrix / norms).astype(np.float32)

        for record in self._records:
            if record.has_accession:
                self._by_accession[record.cellosaurus_accession.upper()] = record

        self._build_lexical_index()

    def _build_lexical_index(self) -> None:
        self._doc_tokens = []
        self._doc_lengths = []
        document_frequency: Counter = Counter()
        for record in self._records:
            tokens = tokenize(record.embed_text())
            counts = Counter(tokens)
            self._doc_tokens.append(counts)
            self._doc_lengths.append(len(tokens))
            document_frequency.update(counts.keys())

        total = len(self._records) or 1
        self._avg_length = (sum(self._doc_lengths) / total) if self._doc_lengths else 0.0
        self._idf = {
            term: math.log(1 + (total - freq + 0.5) / (freq + 0.5))
            for term, freq in document_frequency.items()
        }

    def get_by_accession(self, accession: str) -> CellLineRecord | None:
        self.load()
        normalized = normalize_cellosaurus_accession(accession)
        if not normalized:
            return None
        return self._by_accession.get(normalized)

    async def search(self, query: str, k: int = 8) -> list[CellLineHit]:
        self.load()
        if not self._records or not (query or "").strip():
            return []

        # Exact accession short-circuit.
        by_acc = self.get_by_accession(query.strip())
        if by_acc:
            return [CellLineHit(record=by_acc, score=1.0, mode="accession")]

        lexical = self._lexical_scores(query)
        semantic: np.ndarray | None = None

        if self.has_vectors and self._settings.embeddings_configured:
            try:
                vector = await embed_query(query, self._settings)
                if vector:
                    array = np.asarray(vector, dtype=np.float32)
                    norm = float(np.linalg.norm(array)) or 1.0
                    semantic = self._vectors @ (array / norm)
            except (EmbeddingError, Exception):  # noqa: BLE001
                semantic = None

        if semantic is None:
            combined = lexical
            mode = "lexical"
        else:
            combined = SEMANTIC_WEIGHT * _normalize(semantic) + (1 - SEMANTIC_WEIGHT) * _normalize(lexical)
            mode = "hybrid"

        # Add a large additive boost for exact / near-exact name matches.
        # Prefer canonical name over synonym-only hits (so "HeLa" beats "HeLa S3").
        needle = query.strip().casefold()
        compact_needle = re.sub(r"[\s_\-]+", "", needle)
        for index, record in enumerate(self._records):
            boost = 0.0
            for name, weight in (
                (record.cell_line, 50.0),
                (record.cellosaurus_name, 45.0),
            ):
                if not name:
                    continue
                folded = name.casefold()
                compact = re.sub(r"[\s_\-]+", "", folded)
                if folded == needle or compact == compact_needle:
                    boost = max(boost, weight)
            if boost == 0.0:
                for name in record.synonyms:
                    folded = name.casefold()
                    compact = re.sub(r"[\s_\-]+", "", folded)
                    if folded == needle or compact == compact_needle:
                        boost = 20.0
                        break
            if boost:
                combined[index] = float(combined[index]) + boost

        order = np.argsort(-combined)[: max(1, k)]
        return [
            CellLineHit(record=self._records[i], score=float(combined[i]), mode=mode)
            for i in order
            if combined[i] > 0
        ]

    def _lexical_scores(self, query: str) -> np.ndarray:
        terms = tokenize(query)
        scores = np.zeros(len(self._records), dtype=np.float32)
        if not terms:
            return scores
        for index, counts in enumerate(self._doc_tokens):
            length = self._doc_lengths[index] or 1
            score = 0.0
            for term in terms:
                frequency = counts.get(term, 0)
                if not frequency:
                    continue
                idf = self._idf.get(term, 0.0)
                denominator = frequency + BM25_K1 * (
                    1 - BM25_B + BM25_B * length / (self._avg_length or 1)
                )
                score += idf * (frequency * (BM25_K1 + 1)) / denominator
            scores[index] = score
        return scores

    def save(
        self,
        records: list[CellLineRecord],
        vectors: list[list[float]] | None,
        *,
        source: str,
        embedding_model: str | None,
    ) -> None:
        self.index_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "source": source,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "embedding_model": embedding_model,
            "record_count": len(records),
            "records": [record.to_dict() for record in records],
        }
        (self.index_dir / RECORDS_FILE).write_text(
            json.dumps(payload, ensure_ascii=False),
            encoding="utf-8",
        )
        vectors_path = self.index_dir / VECTORS_FILE
        if vectors:
            np.save(vectors_path, np.asarray(vectors, dtype=np.float32))
        elif vectors_path.exists():
            vectors_path.unlink()
        self.reload()


def _normalize(values: np.ndarray) -> np.ndarray:
    if values.size == 0:
        return values
    low = float(values.min())
    high = float(values.max())
    if high - low < 1e-9:
        return np.zeros_like(values)
    return (values - low) / (high - low)


_store: CellLineStore | None = None


def get_cellline_store() -> CellLineStore:
    global _store
    if _store is None:
        _store = CellLineStore()
    return _store
