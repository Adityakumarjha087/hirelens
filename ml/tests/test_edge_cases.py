"""Edge cases: blank/oversized input, corrupt files, unicode/RTL, upstream LLM failures."""

from __future__ import annotations

import io
from typing import Any

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.llm.anthropic_provider import AnthropicProvider
from app.llm.base import LLMError, StructuredRequest
from app.llm.fake import FakeProvider
from app.main import create_app
from app.nlp.ner import RuleBasedNER
from app.nlp.skills import extract_skills
from app.services.resume_parser import parse_resume_text

from .conftest import TOKEN


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/v1/resumes/parse-text", {"text": " " * 50}),
        ("/v1/resumes/parse-text", {"text": "\n\t" * 30}),
        ("/v1/resumes/parse-text", {"text": "x" * 200_001}),
        ("/v1/jobs/analyze", {"title": "  ", "description": "valid description that is long enough"}),
        ("/v1/jobs/analyze", {"title": "Dev", "description": " " * 40}),
        ("/v1/feedback", {"resume_text": "      " * 10}),
        ("/v1/match", {"job": {"id": "j"}, "candidates": []}),
        ("/v1/redact", {"text": ""}),
        ("/v1/jobs/analyze", {"title": "Dev", "description": "long enough description here", "extra": 1}),
    ],
)
def test_blank_oversized_and_unknown_fields_rejected(client: TestClient, path: str, body: dict[str, Any]) -> None:
    res = client.post(path, json=body)
    assert res.status_code == 422
    assert res.json()["error"] == "validation_error"


@pytest.mark.parametrize(
    ("name", "content", "ctype"),
    [
        ("cv.pdf", b"%PDF-1.4\n%%EOF garbage", "application/pdf"),
        ("cv.docx", b"PK\x03\x04 not really a zip", "application/octet-stream"),
        ("cv.pdf", b"MZ\x90\x00 an exe renamed", "application/pdf"),
        ("cv.txt", b"\xff\xfe\x00\x00\xd8", "text/plain"),
        ("cv.txt", b"", "text/plain"),
        ("cv.txt", b"too short", "text/plain"),
    ],
)
def test_corrupt_and_spoofed_files_return_422(client: TestClient, name: str, content: bytes, ctype: str) -> None:
    res = client.post("/v1/resumes/parse", files={"file": (name, content, ctype)})
    assert res.status_code == 422, res.text
    assert "Traceback" not in res.text


def test_unicode_rtl_and_emoji_resume() -> None:
    text = (
        "مريم الحسن\nSenior Engineer 🚀\nmaryam@example.com | Dubai\n\nSKILLS\nPython, Kubernetes, 数据分析\n\n"
        "EXPERIENCE\nStaff Engineer — Careem (Jan 2019 - Present)\n- Led migration to Kubernetes 🎉\n"
    )
    res = parse_resume_text(text, FakeProvider(), RuleBasedNER())
    assert {"Python", "Kubernetes"} <= set(res.profile.skills)
    assert "数据分析" in res.profile.skills
    assert res.profile.location == "Dubai"
    assert res.profile.experience[0].company == "Careem"
    assert "maryam@example.com" not in res.redacted_text
    assert extract_skills("🚀🚀 python🙂") == ["Python"]


def test_upstream_llm_timeout_falls_back_to_heuristics(settings: Settings, resume_text: str) -> None:
    def slow(_: httpx2.Request) -> httpx2.Response:
        raise httpx2.ReadTimeout("timed out")

    provider = AnthropicProvider("sk-test", http_client=httpx2.Client(transport=httpx2.MockTransport(slow)))
    provider._client = provider._client.with_options(max_retries=0)
    with TestClient(create_app(settings, llm=provider)) as c:
        res = c.post("/v1/resumes/parse-text", json={"text": resume_text}, headers={"X-Service-Token": TOKEN})
        assert res.status_code == 200
        body = res.json()
        assert body["meta"]["source"] == "heuristic" and body["profile"]["name"] == "Priya Sharma"


def test_upstream_llm_garbage_json_falls_back(settings: Settings) -> None:
    class Garbage:
        name = "garbage"

        def generate_json(self, request: StructuredRequest) -> dict[str, Any]:
            raise LLMError("Invalid JSON from model")

    with TestClient(create_app(settings, llm=Garbage())) as c:
        res = c.post("/v1/jobs/analyze", headers={"X-Service-Token": TOKEN},
                     json={"title": "Go Developer", "description": "Need Go, Docker and Kubernetes skills."})
        assert res.status_code == 200 and res.json()["source"] == "heuristic"
        assert "Docker" in res.json()["analysis"]["required_skills"]


def test_large_but_valid_pdf_upload(client: TestClient) -> None:
    from .test_text_extraction import make_pdf

    pdf = make_pdf(["Long Resume", "SKILLS", "Python, Go"] + [f"- Built thing {i} with Python" for i in range(40)])
    assert len(pdf) < 5 * 1024 * 1024
    res = client.post("/v1/resumes/parse", files={"file": ("long.pdf", io.BytesIO(pdf), "application/pdf")})
    assert res.status_code == 200 and "Python" in res.json()["profile"]["skills"]
