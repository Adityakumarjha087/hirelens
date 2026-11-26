from __future__ import annotations

from app.config import Settings
from app.embeddings.factory import build_embedder
from app.embeddings.hashing import HashingEmbedder
from app.llm.fake import FakeProvider
from app.nlp.ner import RuleBasedNER
from app.schemas import (
    AnalyzeJobRequest,
    FeedbackJob,
    FeedbackRequest,
    InterviewRequest,
    MatchCandidate,
    MatchJob,
    MatchRequest,
)
from app.services.feedback import generate_feedback, heuristic_feedback, rewrite_bullet
from app.services.interview import generate_questions
from app.services.job_analyzer import analyze_job, heuristic_analysis
from app.services.matcher import Matcher, calibrate_similarity, cosine, experience_component, skill_component
from app.services.redaction import redact
from app.services.resume_parser import parse_resume_text
from app.vector_store import VectorStore, point_id

from .conftest import JOB_DESCRIPTION


def test_parse_resume_profile(resume_text: str) -> None:
    res = parse_resume_text(resume_text, FakeProvider(), RuleBasedNER())
    p = res.profile
    assert p.name == "Priya Sharma" and p.email == "priya.sharma@example.com"
    assert p.location == "San Francisco, CA"
    assert {"Python", "Go", "Kafka", "Kubernetes", "PostgreSQL"} <= set(p.skills)
    assert len(p.experience) == 2 and p.experience[0].company == "Stripe Inc"
    assert p.years_of_experience >= 7
    assert p.education[0].institution.startswith("University of California")
    assert [pr.name for pr in p.projects] == ["OpenLedger", "QueueViz"]
    assert res.meta.source == "heuristic" and res.meta.llm_provider == "fake"
    assert "Priya" not in res.redacted_text and "priya.sharma@example.com" not in res.redacted_text


def test_job_analysis_sections() -> None:
    a = heuristic_analysis(AnalyzeJobRequest(title="Senior Backend Engineer", description=JOB_DESCRIPTION))
    assert {"Python", "PostgreSQL", "Kafka", "Docker", "Kubernetes"} <= set(a.required_skills)
    assert {"Go", "Terraform", "React"} <= set(a.nice_to_have_skills)
    assert not set(a.required_skills) & set(a.nice_to_have_skills)
    assert a.min_years_experience == 5 and a.seniority == "senior"


def test_job_seniority_inference() -> None:
    assert (
        heuristic_analysis(
            AnalyzeJobRequest(
                title="Software Engineering Intern", description="Learn Python with us in a friendly team."
            )
        ).seniority
        == "intern"
    )
    assert (
        heuristic_analysis(
            AnalyzeJobRequest(title="Platform Engineer", description="Need 6 years of AWS and Terraform skills.")
        ).seniority
        == "senior"
    )
    assert (
        heuristic_analysis(
            AnalyzeJobRequest(title="Developer", description="0-1 years experience with JavaScript is fine.")
        ).seniority
        == "junior"
    )
    res = analyze_job(
        AnalyzeJobRequest(title="Staff Engineer", description="Lead design of Rust services at scale."),
        FakeProvider(),
    )
    assert res.analysis.seniority == "lead" and res.source == "heuristic"


def test_matcher_components() -> None:
    job = MatchJob(id="j", required_skills=["Python", "Kafka"], nice_to_have_skills=["Go"], min_years_experience=4)
    score, parts = skill_component(job, ["python", "golang"])
    assert parts["matched_required"] == ["Python"] and parts["missing_required"] == ["Kafka"]
    assert parts["matched_nice_to_have"] == ["Go"]
    assert score == round(0.8 * 0.5 + 0.2 * 1.0, 4)
    assert skill_component(MatchJob(id="x"), ["Python"])[0] == 0.5
    assert skill_component(MatchJob(id="x", required_skills=["A"]), ["A"])[0] == 1.0
    assert skill_component(MatchJob(id="x", nice_to_have_skills=["A"]), [])[0] == 0.0
    assert experience_component(2, 4) == 0.5 and experience_component(5, 4) == 1.0
    assert experience_component(0, 0) == 1.0
    assert cosine([1, 0], [1, 0]) == 1.0 and cosine([0, 0], [1, 0]) == 0.0
    assert calibrate_similarity(0.6) == 1.0 and calibrate_similarity(-0.2) == 0.0


def test_matcher_ranks_relevant_candidate_first(resume_text: str) -> None:
    settings = Settings(qdrant_url=":memory:")
    emb = HashingEmbedder()
    store = VectorStore(":memory:", None, emb.dim)
    matcher = Matcher(emb, store, settings)
    store.upsert(settings.qdrant_job_collection, "job-1", emb.embed([JOB_DESCRIPTION])[0], {})
    store.upsert(settings.qdrant_resume_collection, "r-strong", emb.embed([resume_text])[0], {})
    res = matcher.match(
        MatchRequest(
            job=MatchJob(
                id="job-1",
                required_skills=["Python", "PostgreSQL", "Kafka", "Docker", "Kubernetes"],
                nice_to_have_skills=["Go", "Terraform"],
                min_years_experience=5,
            ),
            candidates=[
                MatchCandidate(
                    resume_id="r-weak",
                    text="Graphic designer skilled in Photoshop and Figma, 2 years.",
                    skills=["UX Design"],
                    years_of_experience=2,
                ),
                MatchCandidate(
                    resume_id="r-strong",
                    skills=["Python", "PostgreSQL", "Kafka", "Docker", "Kubernetes", "Go"],
                    years_of_experience=9,
                ),
            ],
        )
    )
    assert [r.resume_id for r in res.results] == ["r-strong", "r-weak"]
    strong, weak = res.results
    assert strong.score > 70 > weak.score
    assert strong.breakdown.experience_fit == 1.0 and "Meets" in " ".join(strong.breakdown.explanation)
    assert weak.breakdown.missing_required and "Missing required" in " ".join(weak.breakdown.explanation)
    assert abs(sum(strong.breakdown.weights.values()) - 1.0) < 1e-3


def test_hashing_embedder_properties() -> None:
    emb = build_embedder(Settings())
    a, b, c = emb.embed(["Python Kafka engineer", "Python Kafka engineer", "Pastry chef baking bread"])
    assert len(a) == 384 and a == b
    assert cosine(a, b) > 0.99 > cosine(a, c)
    assert emb.embed([""])[0] == [0.0] * 384


def test_vector_store_roundtrip() -> None:
    store = VectorStore(":memory:", None, 3)
    store.upsert("c", "not-a-uuid", [1.0, 0.0, 0.0], {"k": "v"})
    store.upsert("c", "00000000-0000-0000-0000-000000000001", [0.0, 1.0, 0.0], {})
    assert set(store.get_vectors("c", ["not-a-uuid", "missing"])) == {"not-a-uuid"}
    assert store.get_vectors("c", []) == {}
    hits = store.search("c", [1.0, 0.1, 0.0], 2)
    assert hits[0][0] == "not-a-uuid"
    store.delete("c", "not-a-uuid")
    assert store.get_vectors("c", ["not-a-uuid"]) == {}
    assert store.healthy()
    assert point_id("abc") == point_id("abc") != point_id("abd")


def test_feedback_scores_and_rewrites(resume_text: str) -> None:
    fb = heuristic_feedback(
        FeedbackRequest(
            resume_text=resume_text,
            job=FeedbackJob(
                title="ML Engineer",
                description="Requires PyTorch, Python and AWS",
                required_skills=["PyTorch", "Python"],
            ),
        )
    )
    assert 50 <= fb.ats_score <= 100
    assert "PyTorch" in fb.missing_keywords and "Python" in fb.present_keywords
    originals = [r.original for r in fb.bullet_rewrites]
    assert "Responsible for maintaining the file metadata service" in originals
    rewritten = next(r.suggestion for r in fb.bullet_rewrites if r.original.startswith("Responsible"))
    assert rewritten.startswith("Maintained the file metadata service") and "[X%]" in rewritten
    assert sum(c.weight for c in fb.checks) == 100


def test_feedback_without_job_and_poor_resume() -> None:
    res = generate_feedback(
        FeedbackRequest(resume_text="I am a hard worker. I like computers and my dog a lot."), FakeProvider()
    )
    assert res.feedback.ats_score < 30 and res.source == "heuristic"
    assert any(not c.passed and c.id == "section_experience" for c in res.feedback.checks)


def test_rewrite_bullet_variants() -> None:
    assert rewrite_bullet("worked on the billing system").startswith("Developed the billing system")
    assert rewrite_bullet("helped to onboard clients").startswith("Contributed to onboard")
    assert rewrite_bullet("Built X serving 3M users") == "Built X serving 3M users."
    assert rewrite_bullet("building pipelines").startswith("Built pipelines")


def test_interview_questions(resume_text: str) -> None:
    profile = parse_resume_text(resume_text, FakeProvider(), RuleBasedNER()).profile
    res = generate_questions(
        InterviewRequest(
            profile=profile,
            job=FeedbackJob(title="Backend Engineer", required_skills=["Python", "Kafka", "Rust"]),
            count=10,
        ),
        FakeProvider(),
    )
    cats = {q.category for q in res.questions}
    assert {"technical", "experience", "gap", "behavioral"} <= cats
    assert any("Rust" in q.question for q in res.questions)
    assert any("Stripe Inc" in q.question for q in res.questions)
    assert len(res.questions) <= 10
    short = generate_questions(InterviewRequest(profile=profile, job=FeedbackJob(title="X"), count=2), FakeProvider())
    assert len(short.questions) == 2


def test_redaction() -> None:
    text = (
        "Maria Lopez\nmaria@x.io | +44 20 7946 0958\nShe is a mother of two. Age: 41. Born in 1983. "
        "Gender: Female. Photo attached. Mrs. Lopez led her team."
    )
    out, counts = redact(text)
    for leak in ("Maria", "Lopez", "maria@x.io", "She ", "mother", "41", "Female", "her team"):
        assert leak not in out
    assert counts["name"] >= 2 and counts["contact"] >= 2 and counts["age"] >= 1 and counts["gender"] >= 2


def test_redacted_profile_hides_identity(resume_text: str) -> None:
    res = parse_resume_text(resume_text, FakeProvider(), RuleBasedNER())
    blind = res.redacted_profile
    assert blind.name == "" and blind.email is None and blind.phone is None
    assert all(e.year is None for e in blind.education)
    assert "She " not in blind.summary and "They led" in blind.summary
    assert blind.skills == res.profile.skills
