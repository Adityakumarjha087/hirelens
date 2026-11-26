"""Runtime configuration, loaded from environment variables (12-factor)."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

LLMProviderName = Literal["fake", "anthropic", "openai", "gemini", "ollama"]
EmbeddingProviderName = Literal["hashing", "sentence-transformers"]
NERProviderName = Literal["auto", "rule", "spacy"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AI_", env_file=".env", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    service_token: str = Field(default="dev-internal-token", description="Shared secret for service-to-service auth")

    llm_provider: LLMProviderName = "fake"
    llm_timeout_seconds: float = 30.0
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5-5"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"

    embedding_provider: EmbeddingProviderName = "hashing"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dim: int = 384

    ner_provider: NERProviderName = "auto"
    spacy_model: str = "en_core_web_sm"

    qdrant_url: str = ":memory:"
    qdrant_api_key: str | None = None
    qdrant_resume_collection: str = "hirelens_resumes"
    qdrant_job_collection: str = "hirelens_jobs"

    max_upload_bytes: int = 5 * 1024 * 1024

    # Match score weights (must sum to 1.0; normalised defensively at runtime).
    weight_semantic: float = 0.45
    weight_skills: float = 0.40
    weight_experience: float = 0.15


@lru_cache
def get_settings() -> Settings:
    return Settings()
