"""Service-to-service contract (exported as OpenAPI for the NestJS backend)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------- resume parsing
class ExperienceItem(StrictModel):
    title: str = ""
    company: str = ""
    start: str | None = Field(default=None, description="Start date as written, e.g. 'Jan 2020'")
    end: str | None = Field(default=None, description="End date or 'Present'")
    duration_months: int = Field(default=0, ge=0)
    highlights: list[str] = Field(default_factory=list)


class EducationItem(StrictModel):
    institution: str = ""
    degree: str = ""
    field: str = ""
    year: str | None = None


class ProjectItem(StrictModel):
    name: str = ""
    description: str = ""
    technologies: list[str] = Field(default_factory=list)


class ResumeProfile(StrictModel):
    name: str = ""
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    experience: list[ExperienceItem] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    years_of_experience: float = Field(default=0.0, ge=0.0, le=60.0)


class Entity(StrictModel):
    text: str
    label: str


class ParseMeta(StrictModel):
    llm_provider: str
    source: Literal["llm", "heuristic"]
    ner_provider: str
    char_count: int


class ParseResumeResponse(StrictModel):
    profile: ResumeProfile
    text: str
    redacted_text: str
    redacted_profile: ResumeProfile = Field(description="Profile with identity, gender and age signals removed")
    entities: list[Entity]
    meta: ParseMeta


class ParseTextRequest(StrictModel):
    text: str = Field(min_length=20, max_length=200_000)


# --------------------------------------------------------------------------- jobs
class AnalyzeJobRequest(StrictModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=20, max_length=50_000)


class JobAnalysis(StrictModel):
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    min_years_experience: float = Field(default=0.0, ge=0.0, le=40.0)
    seniority: Literal["intern", "junior", "mid", "senior", "lead"] = "mid"
    keywords: list[str] = Field(default_factory=list)


class AnalyzeJobResponse(StrictModel):
    analysis: JobAnalysis
    llm_provider: str
    source: Literal["llm", "heuristic"]


# --------------------------------------------------------------------------- vector index
class IndexRequest(StrictModel):
    id: str = Field(description="UUID of the resume or job in the backend database")
    text: str = Field(min_length=1, max_length=200_000)
    metadata: dict[str, str | float | int | bool | list[str]] = Field(default_factory=dict)


class IndexResponse(StrictModel):
    id: str
    collection: str
    dim: int
    embedding_provider: str


class DeleteResponse(StrictModel):
    id: str
    deleted: bool


# --------------------------------------------------------------------------- matching
class MatchJob(StrictModel):
    id: str
    text: str = Field(default="", description="Fallback text if the job vector is not indexed")
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    min_years_experience: float = 0.0


class MatchCandidate(StrictModel):
    resume_id: str
    text: str = Field(default="", description="Fallback text if the resume vector is not indexed")
    skills: list[str] = Field(default_factory=list)
    years_of_experience: float = 0.0


class MatchRequest(StrictModel):
    job: MatchJob
    candidates: list[MatchCandidate] = Field(min_length=1, max_length=500)


class ScoreBreakdown(StrictModel):
    semantic_similarity: float = Field(ge=0, le=1)
    skill_overlap: float = Field(ge=0, le=1)
    experience_fit: float = Field(ge=0, le=1)
    weights: dict[str, float]
    matched_required: list[str]
    missing_required: list[str]
    matched_nice_to_have: list[str]
    missing_nice_to_have: list[str]
    candidate_years: float
    required_years: float
    explanation: list[str]


class MatchResult(StrictModel):
    resume_id: str
    score: float = Field(ge=0, le=100)
    breakdown: ScoreBreakdown


class MatchResponse(StrictModel):
    job_id: str
    results: list[MatchResult]


class SimilarResumesRequest(StrictModel):
    job_id: str
    limit: int = Field(default=20, ge=1, le=200)


class SimilarHit(StrictModel):
    id: str
    score: float


class SimilarResumesResponse(StrictModel):
    hits: list[SimilarHit]


# --------------------------------------------------------------------------- feedback
class FeedbackJob(StrictModel):
    title: str = ""
    description: str = ""
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)


class FeedbackRequest(StrictModel):
    resume_text: str = Field(min_length=20, max_length=200_000)
    profile: ResumeProfile | None = None
    job: FeedbackJob | None = None


class AtsCheck(StrictModel):
    id: str
    label: str
    passed: bool
    weight: int
    tip: str


class BulletRewrite(StrictModel):
    original: str
    suggestion: str
    reason: str


class ResumeFeedback(StrictModel):
    ats_score: int = Field(ge=0, le=100)
    checks: list[AtsCheck]
    missing_keywords: list[str]
    present_keywords: list[str]
    bullet_rewrites: list[BulletRewrite]
    strengths: list[str]
    summary: str


class FeedbackResponse(StrictModel):
    feedback: ResumeFeedback
    llm_provider: str
    source: Literal["llm", "heuristic"]


# --------------------------------------------------------------------------- interview questions
class InterviewRequest(StrictModel):
    profile: ResumeProfile
    job: FeedbackJob
    count: int = Field(default=8, ge=1, le=20)


class InterviewQuestion(StrictModel):
    question: str
    category: Literal["technical", "behavioral", "experience", "gap", "culture"]
    difficulty: Literal["easy", "medium", "hard"]
    rationale: str


class InterviewQuestionSet(StrictModel):
    questions: list[InterviewQuestion]


class InterviewResponse(StrictModel):
    questions: list[InterviewQuestion]
    llm_provider: str
    source: Literal["llm", "heuristic"]


# --------------------------------------------------------------------------- redaction
class RedactRequest(StrictModel):
    text: str = Field(min_length=1, max_length=200_000)
    name: str | None = None


class RedactResponse(StrictModel):
    redacted_text: str
    removed: dict[str, int]


class HealthResponse(StrictModel):
    status: Literal["ok", "degraded"]
    llm_provider: str
    embedding_provider: str
    ner_provider: str
    vector_store: str
    version: str
