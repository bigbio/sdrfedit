"""Persistent vector store for the SDRF specification knowledge base.

Backed by a numpy matrix plus a JSON sidecar. The corpus is a few hundred
chunks, so an exhaustive cosine scan is instant and avoids a heavyweight vector
database dependency; the interface below is the only thing a swap to
FAISS/Chroma would need to reimplement.

Retrieval is hybrid: cosine similarity over embeddings when an index was built
with an embedding endpoint, blended with a BM25-style lexical score. When no
embeddings exist the store degrades to lexical-only so the assistant still
answers specification questions offline.
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
from .chunker import SpecChunk
from .embeddings import EmbeddingError, embed_query

CHUNKS_FILE = "chunks.json"
VECTORS_FILE = "vectors.npy"

TOKEN_RE = re.compile(r"[a-z0-9\[\]]+")
STOPWORDS = {
    "the", "a", "an", "of", "for", "and", "or", "to", "in", "is", "are", "be",
    "on", "with", "how", "what", "which", "should", "do", "does", "can", "i",
    "my", "it", "this", "that", "as", "by", "at", "from", "use", "used",
}

BM25_K1 = 1.4
BM25_B = 0.72
SEMANTIC_WEIGHT = 0.7


def tokenize(text: str) -> list[str]:
    """Tokenize, keeping `comment[label]` whole *and* emitting its parts.

    Retrieval needs both: an exact column reference should score highly, but a
    query that only says "label" must still reach the chunk that defines it.
    """
    tokens: list[str] = []
    for raw in TOKEN_RE.findall(text.lower()):
        if raw in STOPWORDS or len(raw) < 2:
            continue
        tokens.append(raw)
        if "[" in raw or "]" in raw:
            tokens.extend(
                part for part in re.split(r"[\[\]]+", raw) if part and part not in STOPWORDS and len(part) > 1
            )
    return tokens


@dataclass
class SearchHit:
    chunk: SpecChunk
    score: float
    mode: str


class SpecStore:
    """Loads the on-disk index lazily and answers similarity queries."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._loaded = False
        self._chunks: list[SpecChunk] = []
        self._vectors: np.ndarray | None = None
        self._meta: dict = {}
        self._doc_tokens: list[Counter] = []
        self._doc_lengths: list[int] = []
        self._avg_length = 0.0
        self._idf: dict[str, float] = {}

    # ------------------------------------------------------------------ state

    @property
    def index_dir(self) -> Path:
        return self._settings.spec_index_path

    @property
    def chunk_count(self) -> int:
        self.load()
        return len(self._chunks)

    @property
    def ready(self) -> bool:
        self.load()
        return bool(self._chunks)

    @property
    def has_vectors(self) -> bool:
        self.load()
        return self._vectors is not None and len(self._chunks) == self._vectors.shape[0]

    @property
    def retrieval_mode(self) -> str:
        if not self.ready:
            return "unavailable"
        if self.has_vectors and self._settings.embeddings_configured:
            return "hybrid"
        return "lexical"

    @property
    def meta(self) -> dict:
        self.load()
        return self._meta

    def reload(self) -> None:
        self._loaded = False
        self.load()

    def load(self) -> None:
        if self._loaded:
            return
        self._loaded = True

        chunks_path = self.index_dir / CHUNKS_FILE
        if not chunks_path.exists():
            return

        payload = json.loads(chunks_path.read_text(encoding="utf-8"))
        self._meta = {k: v for k, v in payload.items() if k != "chunks"}
        self._chunks = [SpecChunk.from_dict(raw) for raw in payload.get("chunks", [])]

        vectors_path = self.index_dir / VECTORS_FILE
        if vectors_path.exists():
            matrix = np.load(vectors_path)
            if matrix.shape[0] == len(self._chunks):
                norms = np.linalg.norm(matrix, axis=1, keepdims=True)
                norms[norms == 0] = 1.0
                self._vectors = (matrix / norms).astype(np.float32)

        self._build_lexical_index()

    def _build_lexical_index(self) -> None:
        self._doc_tokens = []
        self._doc_lengths = []
        document_frequency: Counter = Counter()

        for chunk in self._chunks:
            tokens = tokenize(chunk.embed_text)
            counts = Counter(tokens)
            self._doc_tokens.append(counts)
            self._doc_lengths.append(len(tokens))
            document_frequency.update(counts.keys())

        total = len(self._chunks) or 1
        self._avg_length = (sum(self._doc_lengths) / total) if self._doc_lengths else 0.0
        self._idf = {
            term: math.log(1 + (total - freq + 0.5) / (freq + 0.5))
            for term, freq in document_frequency.items()
        }

    # ----------------------------------------------------------------- search

    async def search(self, query: str, k: int = 5) -> list[SearchHit]:
        self.load()
        if not self._chunks or not query.strip():
            return []

        lexical = self._lexical_scores(query)
        semantic: np.ndarray | None = None

        if self.has_vectors and self._settings.embeddings_configured:
            try:
                vector = await embed_query(query, self._settings)
                if vector:
                    array = np.asarray(vector, dtype=np.float32)
                    norm = float(np.linalg.norm(array)) or 1.0
                    semantic = self._vectors @ (array / norm)
            except (EmbeddingError, Exception):  # noqa: BLE001 - retrieval must not break chat
                semantic = None

        if semantic is None:
            combined = lexical
            mode = "lexical"
        else:
            combined = SEMANTIC_WEIGHT * _normalize(semantic) + (1 - SEMANTIC_WEIGHT) * _normalize(lexical)
            mode = "hybrid"

        order = np.argsort(-combined)[: max(1, k)]
        return [
            SearchHit(chunk=self._chunks[i], score=float(combined[i]), mode=mode)
            for i in order
            if combined[i] > 0
        ]

    def _lexical_scores(self, query: str) -> np.ndarray:
        terms = tokenize(query)
        scores = np.zeros(len(self._chunks), dtype=np.float32)
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

    # ------------------------------------------------------------------ write

    def save(
        self,
        chunks: list[SpecChunk],
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
            "chunk_count": len(chunks),
            "chunks": [chunk.to_dict() for chunk in chunks],
        }
        (self.index_dir / CHUNKS_FILE).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
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


_store: SpecStore | None = None


def get_spec_store() -> SpecStore:
    global _store
    if _store is None:
        _store = SpecStore()
    return _store
