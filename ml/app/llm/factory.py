from __future__ import annotations

from app.config import Settings
from app.llm.base import LLMProvider
from app.llm.fake import FakeProvider


class MissingCredentialsError(RuntimeError):
    pass


def build_llm(settings: Settings) -> LLMProvider:
    provider = settings.llm_provider
    if provider == "fake":
        return FakeProvider()
    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise MissingCredentialsError("AI_ANTHROPIC_API_KEY is required for AI_LLM_PROVIDER=anthropic")
        from app.llm.anthropic_provider import AnthropicProvider

        return AnthropicProvider(settings.anthropic_api_key, settings.anthropic_model, settings.llm_timeout_seconds)
    if provider == "openai":
        if not settings.openai_api_key:
            raise MissingCredentialsError("AI_OPENAI_API_KEY is required for AI_LLM_PROVIDER=openai")
        from app.llm.openai_provider import OpenAIProvider

        return OpenAIProvider(settings.openai_api_key, settings.openai_model, settings.llm_timeout_seconds)
    if provider == "gemini":
        if not settings.gemini_api_key:
            raise MissingCredentialsError("AI_GEMINI_API_KEY is required for AI_LLM_PROVIDER=gemini")
        from app.llm.gemini_provider import GeminiProvider

        return GeminiProvider(settings.gemini_api_key, settings.gemini_model)
    from app.llm.ollama_provider import OllamaProvider

    return OllamaProvider(settings.ollama_base_url, settings.ollama_model, settings.llm_timeout_seconds)
