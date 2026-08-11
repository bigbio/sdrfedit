"""Embedding client for an OpenAI-compatible `/embeddings` endpoint."""

from __future__ import annotations

import httpx

from ..config import Settings, get_settings


class EmbeddingError(RuntimeError):
    pass


async def embed_texts(texts: list[str], settings: Settings | None = None) -> list[list[float]]:
    """Embed a batch of texts. Raises when no embedding endpoint is configured."""
    settings = settings or get_settings()
    if not settings.embeddings_configured:
        raise EmbeddingError(
            "No embedding endpoint configured; set EMBEDDING_API_KEY (or point "
            "EMBEDDING_BASE_URL at a local runtime)."
        )
    if not texts:
        return []

    url = f"{settings.embedding_base_url.rstrip('/')}/embeddings"
    headers = {"Content-Type": "application/json"}
    if settings.embedding_api_key:
        headers["Authorization"] = f"Bearer {settings.embedding_api_key}"

    vectors: list[list[float]] = []
    batch = max(1, settings.embedding_batch_size)

    async with httpx.AsyncClient(timeout=120.0) as client:
        for start in range(0, len(texts), batch):
            slice_ = texts[start : start + batch]
            response = await client.post(
                url,
                headers=headers,
                json={"model": settings.embedding_model, "input": slice_},
            )
            if response.status_code >= 400:
                raise EmbeddingError(f"Embedding request failed ({response.status_code}): {response.text[:400]}")
            payload = response.json()
            data = sorted(payload.get("data", []), key=lambda d: d.get("index", 0))
            if len(data) != len(slice_):
                raise EmbeddingError(f"Embedding response size mismatch: got {len(data)}, expected {len(slice_)}")
            vectors.extend(item["embedding"] for item in data)

    return vectors


async def embed_query(text: str, settings: Settings | None = None) -> list[float]:
    result = await embed_texts([text], settings)
    return result[0] if result else []
