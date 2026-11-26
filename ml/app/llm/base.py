"""Pluggable LLM interface for structured (JSON-schema constrained) generation.

Every task supplies a deterministic ``fallback`` computed by the heuristic pipeline. The
offline ``FakeProvider`` returns it verbatim, which keeps the platform fully functional,
reproducible and free of API keys in dev/CI. Real providers are asked to improve on that
draft; their output is validated against the task's Pydantic model by the caller.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Protocol


class LLMError(RuntimeError):
    """Raised when a provider call fails or returns unusable output."""


@dataclass(frozen=True)
class StructuredRequest:
    task: str
    system: str
    prompt: str
    json_schema: dict[str, Any]
    fallback: dict[str, Any] = field(default_factory=dict)
    max_tokens: int = 4096


class LLMProvider(Protocol):
    name: str

    def generate_json(self, request: StructuredRequest) -> dict[str, Any]: ...


_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def parse_json_text(text: str) -> dict[str, Any]:
    """Parse model text into a JSON object, tolerating code fences and leading prose."""
    candidate = text.strip()
    if m := _FENCE_RE.search(candidate):
        candidate = m.group(1).strip()
    if not candidate.startswith("{"):
        start, end = candidate.find("{"), candidate.rfind("}")
        if start == -1 or end <= start:
            raise LLMError("Model response did not contain a JSON object")
        candidate = candidate[start : end + 1]
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise LLMError(f"Invalid JSON from model: {exc}") from exc
    if not isinstance(data, dict):
        raise LLMError("Model JSON was not an object")
    return data


def strict_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Inline $refs and enforce additionalProperties=false / all-required (structured output rules)."""
    defs = schema.get("$defs", {})

    def walk(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                ref = node["$ref"].split("/")[-1]
                return walk(defs[ref])
            out = {k: walk(v) for k, v in node.items() if k not in ("$defs", "title", "default", "description")}
            if out.get("type") == "object" and "properties" in out:
                out["additionalProperties"] = False
                out["required"] = list(out["properties"].keys())
            for unsupported in (
                "minimum",
                "maximum",
                "exclusiveMinimum",
                "exclusiveMaximum",
                "minLength",
                "maxLength",
                "minItems",
                "maxItems",
            ):
                out.pop(unsupported, None)
            return out
        if isinstance(node, list):
            return [walk(x) for x in node]
        return node

    return dict(walk(schema))


def user_prompt_with_draft(request: StructuredRequest) -> str:
    draft = json.dumps(request.fallback, ensure_ascii=False)[:8000]
    return (
        f"{request.prompt}\n\nA rule-based draft answer is provided; correct and improve it, keeping the same "
        f"JSON shape.\n<draft>{draft}</draft>\n\nRespond with a single JSON object matching the schema."
    )
