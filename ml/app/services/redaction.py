"""Bias-mitigation redaction: strip identity, gender and age signals for blind screening."""

from __future__ import annotations

import re
from collections.abc import Callable

from app.nlp.ner import EMAIL_RE, PHONE_RE, URL_RE, guess_name

_GENDER_TERMS = {
    r"\bhe\b": "they",
    r"\bshe\b": "they",
    r"\bhim\b": "them",
    r"\bher\b": "their",
    r"\bhis\b": "their",
    r"\bhers\b": "theirs",
    r"\bhimself\b": "themself",
    r"\bherself\b": "themself",
    r"\b(?:mr|mrs|ms|miss)\.?(?=\s)": "",
    r"\b(?:male|female|man|woman|husband|wife|mother|father)\b": "[REDACTED]",
    r"\b(?:fraternity|sorority)\b": "student organization",
}
_AGE_PATTERNS = (
    re.compile(r"\b(?:date of birth|dob|born(?: on| in)?)\s*[:\-]?\s*[\w ,/.-]{4,20}", re.IGNORECASE),
    re.compile(r"\bage\s*[:\-]?\s*\d{2}\b", re.IGNORECASE),
    re.compile(r"\b\d{2}\s*(?:years old|yrs old|y/o)\b", re.IGNORECASE),
)
_PERSONAL_PATTERNS = (
    re.compile(r"\b(?:marital status|nationality|religion|gender|sex)\s*[:\-]\s*\w+", re.IGNORECASE),
    re.compile(r"\bphoto\b[^\n]*", re.IGNORECASE),
)


def _match_case(original: str, replacement: str) -> str:
    if replacement and original[:1].isupper() and not replacement.startswith("["):
        return replacement[:1].upper() + replacement[1:]
    return replacement


def _replacer(replacement: str) -> Callable[[re.Match[str]], str]:
    def inner(match: re.Match[str]) -> str:
        return _match_case(match.group(0), replacement)

    return inner


def redact(text: str, name: str | None = None) -> tuple[str, dict[str, int]]:
    counts = {"name": 0, "contact": 0, "gender": 0, "age": 0, "personal": 0}
    out = text
    name = name or guess_name(text)
    if name:
        parts = [re.escape(p) for p in name.split() if len(p) > 1]
        patterns = [re.escape(name), *parts]
        for pat in patterns:
            out, n = re.subn(rf"\b{pat}\b", "[CANDIDATE]", out)
            counts["name"] += n
        out = re.sub(r"\[CANDIDATE\](?:\s+\[CANDIDATE\])+", "[CANDIDATE]", out)
    for rx in (EMAIL_RE, URL_RE, PHONE_RE):
        out, n = rx.subn("[REDACTED]", out)
        counts["contact"] += n
    for rx in _AGE_PATTERNS:
        out, n = rx.subn("[REDACTED]", out)
        counts["age"] += n
    for rx in _PERSONAL_PATTERNS:
        out, n = rx.subn("[REDACTED]", out)
        counts["personal"] += n
    for pat, repl in _GENDER_TERMS.items():
        out, n = re.subn(pat, _replacer(repl), out, flags=re.IGNORECASE)
        counts["gender"] += n
    out = re.sub(r"[ \t]{2,}", " ", out)
    return out, counts
