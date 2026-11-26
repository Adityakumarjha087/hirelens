"""Heuristic resume structure parsing: sections, date ranges, experience, education, projects."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

from app.schemas import EducationItem, ExperienceItem, ProjectItem

SECTION_ALIASES: dict[str, tuple[str, ...]] = {
    "summary": ("summary", "professional summary", "profile", "about me", "objective", "about"),
    "skills": (
        "skills",
        "technical skills",
        "core skills",
        "technologies",
        "tech stack",
        "core competencies",
    ),
    "experience": (
        "experience",
        "work experience",
        "professional experience",
        "employment history",
        "employment",
        "work history",
    ),
    "education": ("education", "academic background", "qualifications"),
    "projects": ("projects", "personal projects", "selected projects", "side projects"),
    "certifications": ("certifications", "certificates", "licenses"),
}
_HEADER_LOOKUP = {alias: key for key, aliases in SECTION_ALIASES.items() for alias in aliases}

MONTHS = {
    m: i
    for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)
}
_MONTH_RE = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
_DATE_RE = rf"(?:{_MONTH_RE}\s+\d{{4}}|\d{{1,2}}/\d{{4}}|\d{{4}})"
DATE_RANGE_RE = re.compile(
    rf"(?P<start>{_DATE_RE})\s*(?:-|–|—|to|until)\s*(?P<end>{_DATE_RE}|present|current|now|today)",
    re.IGNORECASE,
)
YEARS_CLAIM_RE = re.compile(
    r"(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years|yrs)(?:\s+of)?\s+(?:professional\s+)?experience", re.IGNORECASE
)
_BULLET_RE = re.compile(r"^\s*(?:[-*•●▪◦‣]|\d+[.)])\s+")
_DEGREE_RE = re.compile(
    r"\b(B\.?\s?S\.?c?|B\.?\s?A\.?|B\.?\s?Tech|B\.?\s?E\.?|M\.?\s?S\.?c?|M\.?\s?A\.?|M\.?\s?Tech|MBA|Ph\.?\s?D|"
    r"Bachelor(?:'s)?|Master(?:'s)?|Doctorate|Associate(?:'s)?|Diploma)\b[^,\n|]*",
    re.IGNORECASE,
)
_INSTITUTION_RE = re.compile(
    r"([A-Z][\w&.'-]*(?:\s+(?:of|and|&|for|[A-Z][\w&.'-]*))*\s*"
    r"(?:University|Institute|College|School|Academy)(?:\s+of\s+[A-Z][\w-]*(?:\s+[A-Z][\w-]*)*)?)"
    r"|((?:University|Institute|College)\s+of\s+[A-Z][\w-]*(?:\s+[A-Z][\w-]*)*)"
)
_YEAR_RE = re.compile(r"\b(19[6-9]\d|20[0-4]\d)\b")


@dataclass(frozen=True)
class Sections:
    header: list[str]
    blocks: dict[str, list[str]]

    def get(self, key: str) -> list[str]:
        return self.blocks.get(key, [])


def _normalise_header(line: str) -> str | None:
    candidate = re.sub(r"[^a-z &]", "", line.lower()).strip()
    if len(candidate) > 40 or not candidate:
        return None
    return _HEADER_LOOKUP.get(candidate)


def split_sections(text: str) -> Sections:
    header: list[str] = []
    blocks: dict[str, list[str]] = {}
    current: str | None = None
    for raw in text.split("\n"):
        line = raw.strip()
        if not line:
            continue
        key = _normalise_header(line.rstrip(":"))
        if key:
            current = key
            blocks.setdefault(key, [])
            continue
        if current is None:
            header.append(line)
        else:
            blocks[current].append(line)
    return Sections(header=header, blocks=blocks)


def _parse_date(value: str, *, today: date, is_end: bool) -> date | None:
    v = value.strip().lower().rstrip(".")
    if v in {"present", "current", "now", "today"}:
        return today
    if m := re.match(r"(\d{1,2})/(\d{4})", v):
        return date(int(m.group(2)), max(1, min(12, int(m.group(1)))), 1)
    if m := re.match(rf"({_MONTH_RE})\s+(\d{{4}})", v):
        return date(int(m.group(2)), MONTHS[m.group(1)[:3]], 1)
    if m := re.match(r"(\d{4})", v):
        return date(int(m.group(1)), 12 if is_end else 1, 1)
    return None  # pragma: no cover - regex guarantees one branch


def months_between(start: date, end: date) -> int:
    return max(0, (end.year - start.year) * 12 + (end.month - start.month))


def _split_title_company(text: str) -> tuple[str, str]:
    text = text.strip(" ,|-–—()")
    for sep in (" — ", " – ", " - ", " | ", " at ", " @ ", ", "):
        if sep in text:
            left, right = text.split(sep, 1)
            return left.strip(" ,|-–—"), right.strip(" ,|-–—")
    return text, ""


def parse_experience(lines: list[str], *, today: date | None = None) -> list[ExperienceItem]:
    today = today or date.today()
    items: list[ExperienceItem] = []
    current: ExperienceItem | None = None
    for line in lines:
        match = DATE_RANGE_RE.search(line)
        if match and not _BULLET_RE.match(line):
            start = _parse_date(match.group("start"), today=today, is_end=False)
            end = _parse_date(match.group("end"), today=today, is_end=True)
            months = months_between(start, end) if start and end else 0
            title, company = _split_title_company((line[: match.start()] + line[match.end() :]).strip())
            current = ExperienceItem(
                title=title,
                company=company,
                start=match.group("start"),
                end=match.group("end").title()
                if match.group("end").lower() in {"present", "current", "now", "today"}
                else match.group("end"),
                duration_months=months,
            )
            items.append(current)
        elif current is not None:
            bullet = _BULLET_RE.sub("", line).strip()
            if bullet:
                if not _BULLET_RE.match(line) and not current.company and not current.highlights:
                    current.company = bullet
                else:
                    current.highlights.append(bullet)
    return items


def total_experience_years(items: list[ExperienceItem], text: str, *, today: date | None = None) -> float:
    """Union of employment intervals (overlaps are not double-counted); falls back to explicit claims."""
    today = today or date.today()
    intervals: list[tuple[date, date]] = []
    for item in items:
        if not item.start or not item.end:
            continue
        s = _parse_date(item.start, today=today, is_end=False)
        e = _parse_date(item.end, today=today, is_end=True)
        if s and e and e >= s:
            intervals.append((s, e))
    months = 0
    if intervals:
        intervals.sort()
        cur_s, cur_e = intervals[0]
        for s, e in intervals[1:]:
            if months_between(cur_e, s) <= 1:  # overlapping or back-to-back roles
                cur_e = max(cur_e, e)
            else:
                months += months_between(cur_s, cur_e)
                cur_s, cur_e = s, e
        months += months_between(cur_s, cur_e)
    years = round(months / 12, 1)
    if years == 0 and (claim := YEARS_CLAIM_RE.search(text)):
        years = float(claim.group(1))
    return min(years, 60.0)


def parse_education(lines: list[str]) -> list[EducationItem]:
    items: list[EducationItem] = []
    for line in lines:
        clean = _BULLET_RE.sub("", line)
        degree_m = _DEGREE_RE.search(clean)
        inst_m = _INSTITUTION_RE.search(clean)
        if not degree_m:
            if items and not items[-1].institution:
                items[-1].institution = (inst_m.group(0) if inst_m else clean).strip()
                continue
            if not inst_m:
                continue
        degree_text = degree_m.group(0).strip(" ,|-") if degree_m else ""
        field = ""
        if degree_text and (fm := re.search(r"\b(?:in|of)\s+(.+)$", degree_text)):
            field = fm.group(1).strip()
            degree_text = degree_text[: fm.start()].strip()
        elif degree_text and " " in degree_text:
            first, rest = degree_text.split(" ", 1)
            if inst_m is None or rest not in inst_m.group(0):
                degree_text, field = first, rest.strip()
        institution = inst_m.group(0).strip() if inst_m else ""
        if institution and field and institution in field:
            field = field.replace(institution, "").strip(" ,")
        years = _YEAR_RE.findall(clean)
        items.append(
            EducationItem(institution=institution, degree=degree_text, field=field, year=years[-1] if years else None)
        )
    return items


def parse_projects(lines: list[str]) -> list[ProjectItem]:
    from app.nlp.skills import extract_skills

    items: list[ProjectItem] = []
    for line in lines:
        clean = _BULLET_RE.sub("", line).strip()
        is_bullet = bool(_BULLET_RE.match(line))
        name, desc = "", clean
        for sep in (" — ", " – ", " - ", ": "):
            if sep in clean:
                name, desc = clean.split(sep, 1)
                break
        if not name and is_bullet and items:
            items[-1].description = (items[-1].description + " " + clean).strip()
            items[-1].technologies = extract_skills(items[-1].description + " " + items[-1].name)
            continue
        if not name:
            name, desc = clean[:80], ""
        items.append(ProjectItem(name=name.strip(), description=desc.strip(), technologies=extract_skills(clean)))
    return items[:10]


def parse_skill_lines(lines: list[str]) -> list[str]:
    raw: list[str] = []
    for line in lines:
        clean = _BULLET_RE.sub("", line)
        if ":" in clean:
            clean = clean.split(":", 1)[1]
        raw.extend(p.strip() for p in re.split(r"[,;|•·]", clean) if 1 < len(p.strip()) <= 40)
    return raw
