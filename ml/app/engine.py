"""Composition root: wires providers once per process."""

from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings
from app.embeddings.base import Embedder
from app.embeddings.factory import build_embedder
from app.llm.base import LLMProvider
from app.llm.factory import build_llm
from app.nlp.ner import NERProvider, build_ner
from app.services.matcher import Matcher
from app.vector_store import VectorStore


@dataclass
class Engine:
    settings: Settings
    llm: LLMProvider
    embedder: Embedder
    ner: NERProvider
    store: VectorStore
    matcher: Matcher


def build_engine(settings: Settings, *, llm: LLMProvider | None = None) -> Engine:
    llm = llm or build_llm(settings)
    embedder = build_embedder(settings)
    store = VectorStore(settings.qdrant_url, settings.qdrant_api_key, embedder.dim)
    return Engine(
        settings=settings,
        llm=llm,
        embedder=embedder,
        ner=build_ner(settings.ner_provider, settings.spacy_model),
        store=store,
        matcher=Matcher(embedder, store, settings),
    )
