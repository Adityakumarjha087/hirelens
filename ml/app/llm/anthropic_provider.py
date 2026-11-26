from __future__ import annotations

from typing import Any

import anthropic
import httpx2

from app.llm.base import LLMError, StructuredRequest, parse_json_text, strict_schema, user_prompt_with_draft


class AnthropicProvider:
    """Claude via the official SDK with JSON-schema constrained output (output_config.format)."""

    name = "anthropic"

    def __init__(
        self,
        api_key: str,
        model: str = "claude-opus-5-5",
        timeout: float = 30.0,
        http_client: httpx2.Client | None = None,
    ) -> None:
        self.model = model
        self._client = anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=2, http_client=http_client)

    def generate_json(self, request: StructuredRequest) -> dict[str, Any]:
        try:
            response = self._client.beta.messages.create(
                model=self.model,
                max_tokens=request.max_tokens,
                system=request.system,
                messages=[{"role": "user", "content": user_prompt_with_draft(request)}],
                output_config={
                    "effort": "low",
                    "format": {"type": "json_schema", "schema": strict_schema(request.json_schema)},
                },
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except anthropic.APIStatusError as exc:
            raise LLMError(f"Anthropic API error {exc.status_code}: {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise LLMError(f"Anthropic connection error: {exc}") from exc
        if response.stop_reason == "refusal":
            raise LLMError("Anthropic model declined the request")
        if response.stop_reason == "max_tokens":
            raise LLMError("Anthropic response truncated at max_tokens")
        text = "".join(block.text for block in response.content if block.type == "text")
        return parse_json_text(text)
