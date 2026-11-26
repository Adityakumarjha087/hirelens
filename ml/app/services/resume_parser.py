from __future__ import annotations

import re

from app.llm.base import LLMProvider, neutralise_tags
from app.nlp.ner import EMAIL_RE, PHONE_RE, NERProvider, guess_location, guess_name
from app.nlp.sections import (
    parse_education,
    parse_experience,
    parse_projects,
    parse_skill_lines,
    split_sections,
    total_experience_years,
)
from app.nlp.skills import extract_skills, normalize_skills
from app.schemas import ParseMeta, ParseResumeResponse, ResumeProfile
from app.services.redaction import redact
from app.services.structured import run_structured

SYSTEM_PROMPT = (
    "You are an expert technical recruiter and resume parser. Extract structured data from the resume "
    "exactly as written. Never invent employers, dates or skills that are not supported by the text. "
    "Normalise skill names to their common canonical form (e.g. 'ReactJS' -> 'React')."
)


def redact_profile(profile: ResumeProfile) -> ResumeProfile:
    """Blind-screening view: drop identity/contact, neutralise pronouns, hide graduation years (age proxy)."""
    name = profile.name or None

    def clean(value: str) -> str:
        return redact(value, name)[0] if value else value

    blind = profile.model_copy(deep=True)
    blind.name, blind.email, blind.phone = "", None, None
    blind.summary = clean(blind.summary)
    for exp in blind.experience:
        exp.highlights = [clean(h) for h in exp.highlights]
    for edu in blind.education:
        edu.year = None
    for proj in blind.projects:
        proj.description = clean(proj.description)
    return blind


def heuristic_profile(text: str, ner: NERProvider) -> ResumeProfile:
    sections = split_sections(text)
    entities = ner.extract(text)
    name = next((e.text for e in entities if e.label == "PERSON"), "") or guess_name(text)
    email = m.group(0) if (m := EMAIL_RE.search(text)) else None
    phone = None
    for pm in PHONE_RE.finditer(text):
        if 9 <= len(re.sub(r"\D", "", pm.group(0))) <= 15:
            phone = pm.group(0).strip()
            break
    location = guess_location("\n".join(sections.header) or text)
    skills = normalize_skills([*parse_skill_lines(sections.get("skills")), *extract_skills(text)])
    experience = parse_experience(sections.get("experience"))
    summary_lines = sections.get("summary")
    if summary_lines:
        summary = " ".join(summary_lines)
    else:
        summary = " ".join(line for line in sections.header[1:] if not EMAIL_RE.search(line))[:300]
    return ResumeProfile(
        name=name,
        email=email,
        phone=phone,
        location=location,
        summary=summary[:1000],
        skills=skills[:60],
        experience=experience[:15],
        education=parse_education(sections.get("education"))[:6],
        projects=parse_projects(sections.get("projects")),
        years_of_experience=total_experience_years(experience, text),
    )


def parse_resume_text(text: str, llm: LLMProvider, ner: NERProvider) -> ParseResumeResponse:
    draft = heuristic_profile(text, ner)
    profile, source = run_structured(
        llm,
        task="resume_parse",
        system=SYSTEM_PROMPT,
        prompt=f"Parse this resume into the schema.\n<resume>\n{neutralise_tags(text[:60_000])}\n</resume>",
        model=ResumeProfile,
        draft=draft,
    )
    profile.skills = normalize_skills(profile.skills)
    redacted, _ = redact(text, profile.name or None)
    return ParseResumeResponse(
        profile=profile,
        text=text,
        redacted_text=redacted,
        redacted_profile=redact_profile(profile),
        entities=ner.extract(text)[:100],
        meta=ParseMeta(llm_provider=llm.name, source=source, ner_provider=ner.name, char_count=len(text)),
    )
