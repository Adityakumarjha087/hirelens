"""Run an LLM structured-generation task with validation and graceful heuristic fallback."""

from __future__ import annotations

from typing import Literal

import structlog
from pydantic import BaseModel, ValidationError

from app.llm.base import LLMError, LLMProvider, StructuredRequest

log = structlog.get_logger(__name__)
Source = Literal["llm", "heuristic"]


def run_structured[T: BaseModel](
    llm: LLMProvider, *, task: str, system: str, prompt: str, model: type[T], draft: T, max_tokens: int = 4096
) -> tuple[T, Source]:
    if llm.name == "fake":
        # Deterministic path: the provider echoes the draft; still validated for contract safety.
        data = llm.generate_json(
            StructuredRequest(
                task, system, prompt, model.model_json_schema(), draft.model_dump(mode="json"), max_tokens
            )
        )
        return model.model_validate(data), "heuristic"
    request = StructuredRequest(
        task=task,
        system=system,
        prompt=prompt,
        json_schema=model.model_json_schema(),
        fallback=draft.model_dump(mode="json"),
        max_tokens=max_tokens,
    )
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            return model.model_validate(llm.generate_json(request)), "llm"
        except (LLMError, ValidationError) as exc:
            last_error = exc
            log.warning("llm_structured_retry", task=task, attempt=attempt + 1, provider=llm.name, error=str(exc))
            if isinstance(exc, LLMError) and "API error 4" in str(exc):
                break
    log.error("llm_structured_fallback", task=task, provider=llm.name, error=str(last_error))
    return draft, "heuristic"
