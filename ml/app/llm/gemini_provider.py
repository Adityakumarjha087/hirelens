from __future__ import annotations

from typing import Any

from app.llm.base import LLMError, StructuredRequest, parse_json_text, user_prompt_with_draft


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash", client: Any | None = None) -> None:
        self.model = model
        if client is None:
            from google import genai

            client = genai.Client(api_key=api_key)
        self._client = client

    def generate_json(self, request: StructuredRequest) -> dict[str, Any]:
        try:
            response = self._client.models.generate_content(
                model=self.model,
                contents=user_prompt_with_draft(request),
                config={
                    "system_instruction": request.system,
                    "response_mime_type": "application/json",
                    "max_output_tokens": request.max_tokens,
                },
            )
        except Exception as exc:  # google-genai raises a variety of error types
            raise LLMError(f"Gemini error: {exc}") from exc
        return parse_json_text(getattr(response, "text", "") or "")
