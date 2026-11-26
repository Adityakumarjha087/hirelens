from __future__ import annotations

from typing import Any

import httpx2

from app.llm.base import (
    UNTRUSTED_CONTENT_RULE,
    LLMError,
    StructuredRequest,
    parse_json_text,
    strict_schema,
    user_prompt_with_draft,
)


class OllamaProvider:
    """Local models through Ollama's /api/chat with a JSON schema passed as ``format``."""

    name = "ollama"

    def __init__(
        self, base_url: str, model: str, timeout: float = 60.0, http_client: httpx2.Client | None = None
    ) -> None:
        self.model = model
        self._client = http_client or httpx2.Client(base_url=base_url, timeout=timeout)
        self._base_url = base_url.rstrip("/")

    def generate_json(self, request: StructuredRequest) -> dict[str, Any]:
        try:
            resp = self._client.post(
                f"{self._base_url}/api/chat",
                json={
                    "model": self.model,
                    "stream": False,
                    "format": strict_schema(request.json_schema),
                    "options": {"temperature": 0},
                    "messages": [
                        {"role": "system", "content": f"{request.system}\n\n{UNTRUSTED_CONTENT_RULE}"},
                        {"role": "user", "content": user_prompt_with_draft(request)},
                    ],
                },
            )
            resp.raise_for_status()
        except httpx2.HTTPError as exc:
            raise LLMError(f"Ollama error: {exc}") from exc
        content = resp.json().get("message", {}).get("content", "")
        return parse_json_text(str(content))
