"""Named-entity recognition behind one interface.

``SpacyNER`` uses a spaCy pipeline when the optional dependency and model are installed;
``RuleBasedNER`` is a dependency-free fallback used in tests/CI and lightweight images.
"""

from __future__ import annotations

import re
from typing import Protocol

from app.schemas import Entity

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}")
URL_RE = re.compile(r"(?:https?://|www\.)\S+|(?:linkedin|github)\.com/\S+", re.IGNORECASE)

KNOWN_LOCATIONS = (
    "San Francisco",
    "New York",
    "Seattle",
    "Austin",
    "Boston",
    "Chicago",
    "Los Angeles",
    "Denver",
    "Toronto",
    "Vancouver",
    "London",
    "Berlin",
    "Amsterdam",
    "Paris",
    "Dublin",
    "Madrid",
    "Lisbon",
    "Bangalore",
    "Bengaluru",
    "Mumbai",
    "Delhi",
    "New Delhi",
    "Hyderabad",
    "Pune",
    "Chennai",
    "Gurgaon",
    "Noida",
    "Singapore",
    "Sydney",
    "Melbourne",
    "Tokyo",
    "Remote",
    "Dubai",
    "Zurich",
    "Stockholm",
)
_LOCATION_RE = re.compile(
    r"\b(" + "|".join(re.escape(x) for x in KNOWN_LOCATIONS) + r")\b(?:,\s*([A-Z]{2}|[A-Z][a-z]+))?"
)
_ORG_SUFFIX_RE = re.compile(
    r"\b([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*)*\s+(?:Inc|LLC|Ltd|Corp|Corporation|Technologies|Labs|Systems|"
    r"University|Institute|College|GmbH|Solutions|Software))\b\.?"
)
_NAME_LINE_RE = re.compile(r"^[A-Z][a-zA-Z'’-]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-zA-Z'’-]+){1,2}$")
_HEADER_WORDS = {
    "resume",
    "curriculum",
    "vitae",
    "cv",
    "summary",
    "profile",
    "experience",
    "skills",
    "education",
}


class NERProvider(Protocol):
    name: str

    def extract(self, text: str) -> list[Entity]: ...


def guess_name(text: str) -> str:
    for raw in text.split("\n")[:6]:
        line = raw.strip().strip("|").strip()
        if not line or EMAIL_RE.search(line) or any(ch.isdigit() for ch in line):
            continue
        if line.lower() in _HEADER_WORDS:
            continue
        if _NAME_LINE_RE.match(line):
            return line
    return ""


def guess_location(text: str) -> str | None:
    match = _LOCATION_RE.search(text[:1500])
    if not match:
        return None
    return match.group(0).strip().rstrip(",")


class RuleBasedNER:
    name = "rule"

    def extract(self, text: str) -> list[Entity]:
        entities: list[Entity] = []
        seen: set[tuple[str, str]] = set()

        def add(value: str, label: str) -> None:
            key = (value.lower(), label)
            if value and key not in seen:
                seen.add(key)
                entities.append(Entity(text=value, label=label))

        if name := guess_name(text):
            add(name, "PERSON")
        for m in EMAIL_RE.finditer(text):
            add(m.group(0), "EMAIL")
        for m in PHONE_RE.finditer(text):
            digits = re.sub(r"\D", "", m.group(0))
            if 9 <= len(digits) <= 15:
                add(m.group(0).strip(), "PHONE")
        for m in _LOCATION_RE.finditer(text):
            add(m.group(0).strip().rstrip(","), "GPE")
        for m in _ORG_SUFFIX_RE.finditer(text):
            add(m.group(1).strip(), "ORG")
        for m in URL_RE.finditer(text):
            add(m.group(0), "URL")
        return entities


def build_ner(provider: str, spacy_model: str) -> NERProvider:
    if provider in ("auto", "spacy"):
        try:
            from app.nlp.spacy_ner import SpacyNER

            return SpacyNER(spacy_model)
        except Exception:
            if provider == "spacy":
                raise
    return RuleBasedNER()
