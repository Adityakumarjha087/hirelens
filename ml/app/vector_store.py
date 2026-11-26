"""Thin Qdrant wrapper. Uses an in-process store when QDRANT_URL=':memory:' (tests/CI)."""

from __future__ import annotations

import uuid
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

_NAMESPACE = uuid.UUID("6f1c2d1e-8d6b-4b8a-9a7e-2f1f7a0c5e11")


def point_id(external_id: str) -> str:
    """Qdrant only accepts UUIDs/ints; map any backend id deterministically to a UUID."""
    try:
        return str(uuid.UUID(external_id))
    except ValueError:
        return str(uuid.uuid5(_NAMESPACE, external_id))


class VectorStore:
    def __init__(self, url: str, api_key: str | None, dim: int) -> None:
        self.dim = dim
        self.location = "memory" if url == ":memory:" else url
        self._client = (
            QdrantClient(location=":memory:")
            if url == ":memory:"
            else QdrantClient(url=url, api_key=api_key, timeout=10)
        )
        self._ready: set[str] = set()

    def ensure_collection(self, name: str) -> None:
        if name in self._ready:
            return
        if not self._client.collection_exists(name):
            self._client.create_collection(
                collection_name=name,
                vectors_config=qm.VectorParams(size=self.dim, distance=qm.Distance.COSINE),
            )
        self._ready.add(name)

    def upsert(self, collection: str, external_id: str, vector: list[float], payload: dict[str, Any]) -> None:
        self.ensure_collection(collection)
        self._client.upsert(
            collection_name=collection,
            points=[
                qm.PointStruct(id=point_id(external_id), vector=vector, payload={**payload, "external_id": external_id})
            ],
        )

    def get_vectors(self, collection: str, external_ids: list[str]) -> dict[str, list[float]]:
        self.ensure_collection(collection)
        if not external_ids:
            return {}
        records = self._client.retrieve(
            collection_name=collection, ids=[point_id(i) for i in external_ids], with_vectors=True
        )
        out: dict[str, list[float]] = {}
        for rec in records:
            ext = str((rec.payload or {}).get("external_id", rec.id))
            if isinstance(rec.vector, list):
                out[ext] = [float(x) for x in rec.vector if isinstance(x, (int, float))]
        return out

    def search(self, collection: str, vector: list[float], limit: int) -> list[tuple[str, float]]:
        self.ensure_collection(collection)
        res = self._client.query_points(collection_name=collection, query=vector, limit=limit, with_payload=True)
        return [(str((p.payload or {}).get("external_id", p.id)), float(p.score)) for p in res.points]

    def delete(self, collection: str, external_id: str) -> None:
        self.ensure_collection(collection)
        self._client.delete(collection_name=collection, points_selector=qm.PointIdsList(points=[point_id(external_id)]))

    def healthy(self) -> bool:
        try:
            self._client.get_collections()
            return True
        except Exception:
            return False
