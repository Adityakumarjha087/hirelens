from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

FIXTURES = Path(__file__).parent / "fixtures"
TOKEN = "test-token"


@pytest.fixture
def settings() -> Settings:
    return Settings(env="test", service_token=TOKEN, qdrant_url=":memory:", llm_provider="fake", ner_provider="rule")


@pytest.fixture
def client(settings: Settings) -> TestClient:
    with TestClient(create_app(settings)) as c:
        c.headers.update({"X-Service-Token": TOKEN})
        yield c


@pytest.fixture
def resume_text() -> str:
    return (FIXTURES / "resume_senior.txt").read_text()


JOB_DESCRIPTION = """About the role
You will build the payments platform that moves billions of dollars.
Requirements:
- 5+ years of experience with Python and PostgreSQL
- Production experience with Kafka, Docker and Kubernetes
Nice to have:
- Go, Terraform
- Experience with React is a plus
"""
