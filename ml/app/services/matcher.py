"""Explainable match score = weighted(semantic similarity, skill overlap, experience fit)."""

from __future__ import annotations

import math

from app.config import Settings
from app.embeddings.base import Embedder
from app.nlp.skills import skill_key
from app.schemas import MatchCandidate, MatchJob, MatchRequest, MatchResponse, MatchResult, ScoreBreakdown
from app.vector_store import VectorStore

REQUIRED_SHARE = 0.8  # share of the skill component driven by required (vs nice-to-have) skills


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return float(dot / (na * nb)) if na and nb else 0.0


def calibrate_similarity(raw: float) -> float:
    """Map raw cosine (typically 0.0-0.8 for related docs) onto 0..1 with a soft curve."""
    clipped = max(0.0, min(1.0, raw))
    scaled: float = min(1.0, clipped / 0.6) ** 0.8
    return round(scaled, 4)


def skill_component(job: MatchJob, candidate_skills: list[str]) -> tuple[float, dict[str, list[str]]]:
    have = {skill_key(s) for s in candidate_skills}
    req = list(dict.fromkeys(job.required_skills))
    nice = list(dict.fromkeys(job.nice_to_have_skills))
    matched_req = [s for s in req if skill_key(s) in have]
    matched_nice = [s for s in nice if skill_key(s) in have]
    req_ratio = len(matched_req) / len(req) if req else 1.0
    nice_ratio = len(matched_nice) / len(nice) if nice else (1.0 if req else 0.0)
    if not req and not nice:
        score = 0.5
    elif not nice:
        score = req_ratio
    elif not req:
        score = nice_ratio
    else:
        score = REQUIRED_SHARE * req_ratio + (1 - REQUIRED_SHARE) * nice_ratio
    return round(score, 4), {
        "matched_required": matched_req,
        "missing_required": [s for s in req if s not in matched_req],
        "matched_nice_to_have": matched_nice,
        "missing_nice_to_have": [s for s in nice if s not in matched_nice],
    }


def experience_component(candidate_years: float, required_years: float) -> float:
    if required_years <= 0:
        return 1.0
    if candidate_years >= required_years:
        return 1.0
    # Linear shortfall penalty with a floor so juniors are not zeroed out entirely.
    return round(max(0.0, candidate_years / required_years), 4)


def _weights(settings: Settings) -> dict[str, float]:
    raw = {
        "semantic": settings.weight_semantic,
        "skills": settings.weight_skills,
        "experience": settings.weight_experience,
    }
    total = sum(raw.values()) or 1.0
    return {k: round(v / total, 4) for k, v in raw.items()}


def _explain(
    sem: float, skill: float, exp: float, parts: dict[str, list[str]], cand_years: float, req_years: float
) -> list[str]:
    lines: list[str] = []
    level = "strong" if sem >= 0.75 else "moderate" if sem >= 0.45 else "weak"
    lines.append(f"Semantic similarity between resume and job description is {level} ({sem:.0%}).")
    total_req = len(parts["matched_required"]) + len(parts["missing_required"])
    if total_req:
        lines.append(f"Matches {len(parts['matched_required'])}/{total_req} required skills.")
    if parts["missing_required"]:
        lines.append("Missing required: " + ", ".join(parts["missing_required"][:8]) + ".")
    if parts["matched_nice_to_have"]:
        lines.append("Bonus skills: " + ", ".join(parts["matched_nice_to_have"][:8]) + ".")
    if req_years > 0:
        if exp >= 1.0:
            lines.append(f"Meets the {req_years:g}+ years experience requirement ({cand_years:g} yrs).")
        else:
            lines.append(f"Has {cand_years:g} of the {req_years:g} years of experience requested.")
    if skill >= 0.8 and sem >= 0.6:
        lines.append("Overall a strong fit for this role.")
    return lines


class Matcher:
    def __init__(self, embedder: Embedder, store: VectorStore, settings: Settings) -> None:
        self.embedder = embedder
        self.store = store
        self.settings = settings

    def match(self, req: MatchRequest) -> MatchResponse:
        weights = _weights(self.settings)
        job_vecs = self.store.get_vectors(self.settings.qdrant_job_collection, [req.job.id])
        job_vec = job_vecs.get(req.job.id)
        if job_vec is None:
            job_vec = self.embedder.embed([req.job.text or " ".join(req.job.required_skills) or req.job.id])[0]
        resume_vecs = self.store.get_vectors(
            self.settings.qdrant_resume_collection, [c.resume_id for c in req.candidates]
        )
        missing: list[MatchCandidate] = [c for c in req.candidates if c.resume_id not in resume_vecs]
        if missing:
            for cand, vec in zip(
                missing, self.embedder.embed([c.text or " ".join(c.skills) for c in missing]), strict=True
            ):
                resume_vecs[cand.resume_id] = vec
        results: list[MatchResult] = []
        for cand in req.candidates:
            sem = calibrate_similarity(cosine(job_vec, resume_vecs[cand.resume_id]))
            skill, parts = skill_component(req.job, cand.skills)
            exp = experience_component(cand.years_of_experience, req.job.min_years_experience)
            score = 100 * (weights["semantic"] * sem + weights["skills"] * skill + weights["experience"] * exp)
            results.append(
                MatchResult(
                    resume_id=cand.resume_id,
                    score=round(max(0.0, min(100.0, score)), 1),
                    breakdown=ScoreBreakdown(
                        semantic_similarity=sem,
                        skill_overlap=skill,
                        experience_fit=exp,
                        weights=weights,
                        candidate_years=cand.years_of_experience,
                        required_years=req.job.min_years_experience,
                        explanation=_explain(
                            sem, skill, exp, parts, cand.years_of_experience, req.job.min_years_experience
                        ),
                        **parts,
                    ),
                )
            )
        results.sort(key=lambda r: r.score, reverse=True)
        return MatchResponse(job_id=req.job.id, results=results)
