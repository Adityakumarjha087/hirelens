"""spaCy-backed NER (optional `ml` extra). Raises ImportError/OSError if unavailable."""

from __future__ import annotations

from typing import Any

from app.nlp.ner import RuleBasedNER
from app.schemas import Entity

_KEEP = {"PERSON", "ORG", "GPE", "LOC", "DATE"}


class SpacyNER:
    name = "spacy"

    def __init__(self, model: str) -> None:
        import spacy

        self._nlp: Any = spacy.load(model, disable=["lemmatizer"])
        self._rules = RuleBasedNER()

    def extract(self, text: str) -> list[Entity]:
        doc = self._nlp(text[:100_000])
        entities = [Entity(text=e.text.strip(), label=e.label_) for e in doc.ents if e.label_ in _KEEP]
        # spaCy does not tag emails/phones/urls; merge the deterministic rule-based ones.
        entities.extend(e for e in self._rules.extract(text) if e.label in {"EMAIL", "PHONE", "URL"})
        return entities
