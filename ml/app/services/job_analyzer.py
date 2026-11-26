from __future__ import annotations

import re

from app.llm.base import LLMProvider, neutralise_tags
from app.nlp.skills import SOFT_SKILLS, extract_skills, extract_skills_from_list, normalize_skills
from app.schemas import AnalyzeJobRequest, AnalyzeJobResponse, JobAnalysis
from app.services.structured import run_structured

SYSTEM_PROMPT = (
    "You analyse job descriptions for a hiring platform. Separate hard requirements from nice-to-have "
    "skills, infer minimum years of experience and seniority. Use canonical skill names. Only list skills "
    "that the description actually asks for."
)

_NICE_MARKERS = re.compile(
    r"nice[ -]to[ -]have|bonus|a plus|is a plus|preferred|desirable|good to have|familiarity|exposure to|ideally",
    re.IGNORECASE,
)
_REQUIRED_HEADERS = re.compile(
    r"^(requirements|required|must[ -]have|qualifications|what you.?ll need|you have|"
    r"what we.?re looking for|minimum qualifications)\b",
    re.IGNORECASE,
)
_NICE_HEADERS = re.compile(
    r"^(nice[ -]to[ -]have|bonus|preferred|preferred qualifications|plus|good to have)\b", re.IGNORECASE
)
_NEUTRAL_HEADERS = re.compile(
    r"^(about|responsibilities|what you.?ll do|benefits|perks|who we are|the role)\b", re.IGNORECASE
)
_YEARS_RE = re.compile(r"(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years|yrs)", re.IGNORECASE)
_SENIORITY = (
    ("intern", re.compile(r"\bintern(ship)?\b", re.I)),
    ("lead", re.compile(r"\b(lead|principal|staff|head|architect|manager)\b", re.I)),
    ("senior", re.compile(r"\b(senior|sr\.?)\b", re.I)),
    ("junior", re.compile(r"\b(junior|jr\.?|entry[ -]level|graduate)\b", re.I)),
)


def heuristic_analysis(req: AnalyzeJobRequest) -> JobAnalysis:
    required: list[str] = extract_skills(req.title)
    nice: list[str] = []
    mode = "auto"
    for raw in re.split(r"\n|(?<=[.!?])\s+", req.description):
        line = raw.strip(" -*•\t")
        if not line:
            continue
        header = line.rstrip(":")
        if len(header) < 50 and _NICE_HEADERS.match(header):
            mode = "nice"
            continue
        if len(header) < 50 and _REQUIRED_HEADERS.match(header):
            mode = "required"
            continue
        if len(header) < 50 and _NEUTRAL_HEADERS.match(header):
            mode = "auto"
            continue
        skills = normalize_skills([*extract_skills(line), *extract_skills_from_list(line)])
        if not skills:
            continue
        is_nice = mode == "nice" or bool(_NICE_MARKERS.search(line))
        (nice if is_nice else required).extend(skills)
    required = normalize_skills(required)
    nice = [s for s in normalize_skills(nice) if s not in required]
    years = [int(m.group(1)) for m in _YEARS_RE.finditer(req.description)]
    min_years = float(min(years)) if years else 0.0
    seniority = "mid"
    for level, rx in _SENIORITY:
        if rx.search(req.title):
            seniority = level
            break
    else:
        if min_years >= 5:
            seniority = "senior"
        elif years and min_years <= 1:
            seniority = "junior"
    keywords = [s for s in required if s not in SOFT_SKILLS] + [s for s in nice if s not in SOFT_SKILLS]
    return JobAnalysis(
        required_skills=required[:30],
        nice_to_have_skills=nice[:30],
        min_years_experience=min(min_years, 40.0),
        seniority=seniority,
        keywords=keywords[:40],
    )


def analyze_job(req: AnalyzeJobRequest, llm: LLMProvider) -> AnalyzeJobResponse:
    draft = heuristic_analysis(req)
    analysis, source = run_structured(
        llm,
        task="job_analysis",
        system=SYSTEM_PROMPT,
        prompt=f"Job title: {req.title}\n<description>\n{neutralise_tags(req.description[:30_000])}\n</description>",
        model=JobAnalysis,
        draft=draft,
    )
    analysis.required_skills = normalize_skills(analysis.required_skills)
    analysis.nice_to_have_skills = [
        s for s in normalize_skills(analysis.nice_to_have_skills) if s not in analysis.required_skills
    ]
    return AnalyzeJobResponse(analysis=analysis, llm_provider=llm.name, source=source)
