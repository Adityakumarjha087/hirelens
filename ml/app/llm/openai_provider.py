from __future__ import annotations

from typing import Any

import httpx2
import openai

from app.llm.base import (
    UNTRUSTED_CONTENT_RULE,
    LLMError,
    StructuredRequest,
    parse_json_text,
    strict_schema,
    user_prompt_with_draft,
)


class OpenAIProvider:
    name = "openai"

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        timeout: float = 30.0,
        http_client: httpx2.Client | None = None,
    ) -> None:
        self.model = model
        self._client = openai.OpenAI(api_key=api_key, timeout=timeout, max_retries=2, http_client=http_client)

    def generate_json(self, request: StructuredRequest) -> dict[str, Any]:
        try:
            completion = self._client.chat.completions.create(
                model=self.model,
                max_completion_tokens=request.max_tokens,
                messages=[
                    {"role": "system", "content": f"{request.system}\n\n{UNTRUSTED_CONTENT_RULE}"},
                    {"role": "user", "content": user_prompt_with_draft(request)},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": request.task,
                        "strict": True,
                        "schema": strict_schema(request.json_schema),
                    },
                },
            )
        except openai.APIStatusError as exc:
            raise LLMError(f"OpenAI API error {exc.status_code}: {exc.message}") from exc
        except openai.APIConnectionError as exc:
            raise LLMError(f"OpenAI connection error: {exc}") from exc
        choice = completion.choices[0]
        if choice.message.refusal:
            raise LLMError("OpenAI model refused the request")
        return parse_json_text(choice.message.content or "")
