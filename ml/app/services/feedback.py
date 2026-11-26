"""ATS-friendliness scoring, keyword gap analysis and bullet-point rewrite suggestions."""

from __future__ import annotations

import re

from app.llm.base import LLMProvider
from app.nlp.ner import EMAIL_RE, PHONE_RE
from app.nlp.sections import split_sections
from app.nlp.skills import SOFT_SKILLS, extract_skills, normalize_skills, skill_key
from app.schemas import AtsCheck, BulletRewrite, FeedbackRequest, FeedbackResponse, ResumeFeedback
from app.services.structured import run_structured

SYSTEM_PROMPT = (
    "You are a senior career coach and ATS (applicant tracking system) expert. Give specific, honest, "
    "actionable resume feedback. Rewrite weak bullet points using strong action verbs and measurable impact, "
    "without fabricating facts: use placeholders like [X%] where a metric is unknown."
)

ACTION_VERBS = frozenset(
    [
        "achieved",
        "architected",
        "automated",
        "built",
        "championed",
        "created",
        "cut",
        "decreased",
        "delivered",
        "deployed",
        "designed",
        "developed",
        "drove",
        "engineered",
        "established",
        "grew",
        "implemented",
        "improved",
        "increased",
        "launched",
        "led",
        "managed",
        "mentored",
        "migrated",
        "optimized",
        "owned",
        "reduced",
        "redesigned",
        "refactored",
        "scaled",
        "shipped",
        "spearheaded",
        "streamlined",
        "transformed",
        "accelerated",
        "analyzed",
        "boosted",
        "coordinated",
        "enabled",
        "orchestrated",
        "pioneered",
        "resolved",
        "secured",
        "standardized",
    ]
)
_WEAK_PREFIXES = (
    (re.compile(r"^(?:was\s+)?responsible for\s+", re.I), ""),
    (re.compile(r"^(?:i\s+)?worked on\s+", re.I), "Developed "),
    (re.compile(r"^(?:i\s+)?helped (?:to\s+)?", re.I), "Contributed to "),
    (re.compile(r"^(?:i\s+)?assisted (?:with|in)\s+", re.I), "Supported "),
    (re.compile(r"^(?:i\s+)?was involved in\s+", re.I), "Delivered "),
    (re.compile(r"^(?:i\s+)?participated in\s+", re.I), "Contributed to "),
    (re.compile(r"^(?:i\s+)?did\s+", re.I), "Executed "),
)
_GERUND_TO_PAST = {
    "maintaining": "Maintained",
    "managing": "Managed",
    "building": "Built",
    "developing": "Developed",
    "creating": "Created",
    "writing": "Wrote",
    "testing": "Tested",
    "designing": "Designed",
    "handling": "Handled",
    "leading": "Led",
    "supporting": "Supported",
    "fixing": "Fixed",
    "implementing": "Implemented",
    "running": "Ran",
    "improving": "Improved",
}
_BULLET_RE = re.compile(r"^\s*(?:[-*•●▪◦‣]|\d+[.)])\s+(.*)$")
_NUMBER_RE = re.compile(r"\d|%|\$")
_FIRST_PERSON_RE = re.compile(r"\b(I|me|my|myself)\b")
_WORD_RE = re.compile(r"[A-Za-z][A-Za-z+#.-]*")


def _bullets(text: str) -> list[str]:
    out: list[str] = []
    for line in text.split("\n"):
        if m := _BULLET_RE.match(line):
            out.append(m.group(1).strip())
    return out


def rewrite_bullet(bullet: str) -> str:
    body = bullet.strip().rstrip(".")
    for rx, repl in _WEAK_PREFIXES:
        if rx.match(body):
            body = rx.sub(repl, body, count=1)
            break
    first, _, rest = body.partition(" ")
    if first.lower() in _GERUND_TO_PAST:
        body = f"{_GERUND_TO_PAST[first.lower()]} {rest}".strip()
    elif first.lower() not in ACTION_VERBS and not first[:1].isupper():
        body = body[:1].upper() + body[1:]
    body = body[:1].upper() + body[1:]
    if not _NUMBER_RE.search(body):
        body += ", improving [key metric] by [X%] for [N users/teams]"
    return body + "."


def _keyword_gap(text: str, req: FeedbackRequest) -> tuple[list[str], list[str]]:
    if not req.job:
        return [], extract_skills(text)[:25]
    have = {skill_key(s) for s in extract_skills(text)}
    if req.profile:
        have |= {skill_key(s) for s in req.profile.skills}
    wanted = normalize_skills(
        [
            *req.job.required_skills,
            *req.job.nice_to_have_skills,
            *extract_skills(f"{req.job.title}\n{req.job.description}"),
        ]
    )
    missing = [s for s in wanted if skill_key(s) not in have]
    present = [s for s in wanted if skill_key(s) in have]
    return missing[:25], present[:25]


def heuristic_feedback(req: FeedbackRequest) -> ResumeFeedback:
    text = req.resume_text
    sections = split_sections(text)
    bullets = _bullets(text)
    words = len(_WORD_RE.findall(text))
    quantified = [b for b in bullets if _NUMBER_RE.search(b)]
    action = [b for b in bullets if b.split(" ", 1)[0].lower().strip(",.") in ACTION_VERBS]
    missing, present = _keyword_gap(text, req)
    skills_found = extract_skills(text)
    if req.job:
        wanted = len(missing) + len(present)
        kw_ratio = len(present) / wanted if wanted else 1.0
        kw_check = (
            kw_ratio >= 0.6,
            f"Covers {len(present)}/{wanted} of the target job's keywords",
            "Mirror the job's exact skill wording where it truthfully applies to you.",
        )
    else:
        kw_check = (
            len(skills_found) >= 8,
            f"Lists {len(skills_found)} recognisable skills",
            "Add a dedicated skills section with 8-20 specific technologies and tools.",
        )
    checks = [
        AtsCheck(
            id="contact_email",
            label="Includes an email address",
            passed=bool(EMAIL_RE.search(text)),
            weight=10,
            tip="Put a professional email in the header.",
        ),
        AtsCheck(
            id="contact_phone",
            label="Includes a phone number",
            passed=bool(PHONE_RE.search(text)),
            weight=5,
            tip="Add a phone number in the header so recruiters can reach you.",
        ),
        AtsCheck(
            id="section_experience",
            label="Has a standard 'Experience' section",
            passed=bool(sections.get("experience")),
            weight=10,
            tip="Use the heading 'Experience' or 'Work Experience' so ATS parsers find your roles.",
        ),
        AtsCheck(
            id="section_education",
            label="Has a standard 'Education' section",
            passed=bool(sections.get("education")),
            weight=5,
            tip="Add an 'Education' section.",
        ),
        AtsCheck(
            id="section_skills",
            label="Has a 'Skills' section",
            passed=bool(sections.get("skills")),
            weight=10,
            tip="Add a 'Skills' section listing tools and technologies as plain text.",
        ),
        AtsCheck(
            id="length",
            label=f"Length is appropriate ({words} words)",
            passed=250 <= words <= 1200,
            weight=10,
            tip="Aim for 400-900 words: one page early-career, two pages for senior roles.",
        ),
        AtsCheck(
            id="bullets",
            label=f"Uses bullet points ({len(bullets)} found)",
            passed=len(bullets) >= 4,
            weight=10,
            tip="Describe each role with 3-6 concise bullet points.",
        ),
        AtsCheck(
            id="quantified",
            label=f"Quantified achievements ({len(quantified)}/{len(bullets)} bullets)",
            passed=bool(bullets) and len(quantified) / len(bullets) >= 0.3,
            weight=15,
            tip="Add numbers: %, $, time saved, users served, latency, team size.",
        ),
        AtsCheck(
            id="action_verbs",
            label=f"Bullets start with action verbs ({len(action)}/{len(bullets)})",
            passed=bool(bullets) and len(action) / len(bullets) >= 0.5,
            weight=10,
            tip="Start bullets with verbs like Built, Led, Reduced, Launched.",
        ),
        AtsCheck(
            id="no_first_person",
            label="Avoids first-person pronouns",
            passed=len(_FIRST_PERSON_RE.findall(text)) <= 2,
            weight=5,
            tip="Drop 'I/my'; write 'Led migration…' instead of 'I led the migration…'.",
        ),
        AtsCheck(id="keywords", label=kw_check[1], passed=kw_check[0], weight=10, tip=kw_check[2]),
    ]
    score = sum(c.weight for c in checks if c.passed)
    weak = [b for b in bullets if b not in quantified or b not in action]
    rewrites = [
        BulletRewrite(
            original=b,
            suggestion=rewrite_bullet(b),
            reason="Lead with a strong action verb and quantify the outcome.",
        )
        for b in weak[:5]
    ]
    strengths = [c.label for c in checks if c.passed][:5]
    if present:
        strengths.append("Relevant skills: " + ", ".join(s for s in present[:6] if s not in SOFT_SKILLS))
    failed = [c for c in checks if not c.passed]
    summary = f"ATS score {score}/100. " + (
        "Top improvements: " + "; ".join(c.tip for c in sorted(failed, key=lambda c: -c.weight)[:3])
        if failed
        else "Your resume follows ATS best practices."
    )
    if missing:
        summary += f" Consider addressing these job keywords if you have the experience: {', '.join(missing[:6])}."
    return ResumeFeedback(
        ats_score=score,
        checks=checks,
        missing_keywords=missing,
        present_keywords=present,
        bullet_rewrites=rewrites,
        strengths=strengths,
        summary=summary,
    )


def generate_feedback(req: FeedbackRequest, llm: LLMProvider) -> FeedbackResponse:
    draft = heuristic_feedback(req)
    job_part = f"\nTarget job: {req.job.title}\n<job>{req.job.description[:15_000]}</job>" if req.job else ""
    feedback, source = run_structured(
        llm,
        task="resume_feedback",
        system=SYSTEM_PROMPT,
        prompt=f"Review this resume for ATS-friendliness.{job_part}\n<resume>\n{req.resume_text[:40_000]}\n</resume>",
        model=ResumeFeedback,
        draft=draft,
    )
    if source == "llm":
        # The deterministic checklist is the source of truth for the numeric score (auditable, stable).
        feedback.ats_score = draft.ats_score
        feedback.checks = draft.checks
    return FeedbackResponse(feedback=feedback, llm_provider=llm.name, source=source)
