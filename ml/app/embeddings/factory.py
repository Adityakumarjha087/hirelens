from __future__ import annotations

from app.config import Settings
from app.embeddings.base import Embedder
from app.embeddings.hashing import HashingEmbedder


def build_embedder(settings: Settings) -> Embedder:
    if settings.embedding_provider == "sentence-transformers":
        from app.embeddings.sentence_transformer import SentenceTransformerEmbedder

        return SentenceTransformerEmbedder(settings.embedding_model)
    return HashingEmbedder(settings.embedding_dim)
