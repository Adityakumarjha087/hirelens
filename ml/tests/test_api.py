from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.config import Settings
from app.llm.base import StructuredRequest
from app.main import create_app

from .conftest import JOB_DESCRIPTION, TOKEN
from .test_text_extraction import make_pdf


def test_health_is_public(settings: Settings) -> None:
    with TestClient(create_app(settings)) as c:
        res = c.get("/health")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ok" and body["llm_provider"] == "fake" and body["embedding_provider"] == "hashing"
        assert "x-request-id" in res.headers


def test_service_token_required(settings: Settings) -> None:
    with TestClient(create_app(settings)) as c:
        res = c.post("/v1/redact", json={"text": "hello"})
        assert res.status_code == 401 and res.json()["error"] == "unauthorized"
        assert c.post("/v1/redact", json={"text": "hello"}, headers={"X-Service-Token": "wrong"}).status_code == 401


def test_openapi_contract(client: TestClient) -> None:
    spec = client.get("/openapi.json").json()
    for path in (
        "/v1/resumes/parse",
        "/v1/jobs/analyze",
        "/v1/match",
        "/v1/feedback",
        "/v1/interview-questions",
        "/v1/redact",
        "/v1/resumes/index",
        "/v1/jobs/index",
    ):
        assert path in spec["paths"]


def test_full_flow(client: TestClient, resume_text: str) -> None:
    parsed = client.post("/v1/resumes/parse", files={"file": ("cv.txt", resume_text.encode(), "text/plain")})
    assert parsed.status_code == 200, parsed.text
    profile = parsed.json()["profile"]
    assert profile["name"] == "Priya Sharma"

    job = client.post("/v1/jobs/analyze", json={"title": "Senior Backend Engineer", "description": JOB_DESCRIPTION})
    assert job.status_code == 200
    analysis = job.json()["analysis"]

    rid, jid = "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"
    idx = client.post("/v1/resumes/index", json={"id": rid, "text": resume_text, "metadata": {"skills": ["Go"]}})
    assert idx.status_code == 200 and idx.json()["dim"] == 384
    assert client.post("/v1/jobs/index", json={"id": jid, "text": JOB_DESCRIPTION}).status_code == 200

    similar = client.post("/v1/jobs/similar-resumes", json={"job_id": jid, "limit": 5})
    assert similar.status_code == 200 and similar.json()["hits"][0]["id"] == rid
    assert client.post("/v1/jobs/similar-resumes", json={"job_id": "nope"}).status_code == 404

    match = client.post(
        "/v1/match",
        json={
            "job": {
                "id": jid,
                "required_skills": analysis["required_skills"],
                "nice_to_have_skills": analysis["nice_to_have_skills"],
                "min_years_experience": analysis["min_years_experience"],
            },
            "candidates": [
                {
                    "resume_id": rid,
                    "skills": profile["skills"],
                    "years_of_experience": profile["years_of_experience"],
                }
            ],
        },
    )
    assert match.status_code == 200
    result = match.json()["results"][0]
    assert result["score"] > 70 and result["breakdown"]["matched_required"]

    fb = client.post(
        "/v1/feedback",
        json={
            "resume_text": resume_text,
            "profile": profile,
            "job": {"title": "Backend", "description": JOB_DESCRIPTION},
        },
    )
    assert fb.status_code == 200 and 0 <= fb.json()["feedback"]["ats_score"] <= 100

    iq = client.post(
        "/v1/interview-questions",
        json={
            "profile": profile,
            "job": {"title": "Backend", "required_skills": analysis["required_skills"]},
            "count": 5,
        },
    )
    assert iq.status_code == 200 and len(iq.json()["questions"]) == 5

    red = client.post("/v1/redact", json={"text": resume_text, "name": "Priya Sharma"})
    assert "Priya" not in red.json()["redacted_text"]

    assert client.delete(f"/v1/resumes/{rid}").json()["deleted"] is True
    assert client.delete(f"/v1/jobs/{jid}").json()["deleted"] is True


def test_parse_pdf_and_text_endpoints(client: TestClient) -> None:
    pdf = make_pdf(["Sam Lee", "sam@lee.dev", "SKILLS", "TypeScript, React, Node.js"])
    res = client.post("/v1/resumes/parse", files={"file": ("sam.pdf", pdf, "application/pdf")})
    assert res.status_code == 200 and "TypeScript" in res.json()["profile"]["skills"]
    raw = client.post("/v1/resumes/parse-text", json={"text": "Sam Lee\nSKILLS\nRust, Go and Python, Docker"})
    assert raw.status_code == 200 and "Rust" in raw.json()["profile"]["skills"]


def test_upload_errors(client: TestClient, settings: Settings) -> None:
    bad = client.post("/v1/resumes/parse", files={"file": ("x.png", b"\x89PNG....", "image/png")})
    assert bad.status_code == 422 and bad.json()["error"] == "http_error"
    invalid = client.post("/v1/jobs/analyze", json={"title": "x"})
    assert invalid.status_code == 422 and invalid.json()["error"] == "validation_error"
    small = Settings(**{**settings.model_dump(), "max_upload_bytes": 10})
    with TestClient(create_app(small)) as c:
        res = c.post(
            "/v1/resumes/parse",
            files={"file": ("cv.txt", b"x" * 100, "text/plain")},
            headers={"X-Service-Token": TOKEN},
        )
        assert res.status_code == 413


def test_unhandled_errors_are_masked(settings: Settings) -> None:
    class Exploding:
        name = "exploding"

        def generate_json(self, request: StructuredRequest) -> dict[str, Any]:
            raise ZeroDivisionError("secret internals")

    with TestClient(create_app(settings, llm=Exploding()), raise_server_exceptions=False) as c:
        res = c.post(
            "/v1/jobs/analyze",
            headers={"X-Service-Token": TOKEN},
            json={"title": "Backend Engineer", "description": JOB_DESCRIPTION},
        )
        assert res.status_code == 500 and "secret" not in res.text
