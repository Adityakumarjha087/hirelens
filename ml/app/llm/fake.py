from __future__ import annotations

import copy
from typing import Any

from app.llm.base import StructuredRequest


class FakeProvider:
    """Deterministic offline provider: returns the heuristic draft unchanged."""

    name = "fake"

    def __init__(self) -> None:
        self.calls: list[StructuredRequest] = []

    def generate_json(self, request: StructuredRequest) -> dict[str, Any]:
        self.calls.append(request)
        return copy.deepcopy(request.fallback)
