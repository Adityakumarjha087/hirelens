"""Deterministic, dependency-light embedding fallback.

Feature hashing over word unigrams, bigrams and canonical skills, L2-normalised. It is not a
semantic model, but it captures lexical/skill overlap well enough for offline demos and CI
and has exactly the same interface/dimension as all-MiniLM-L6-v2 (384).
"""

from __future__ import annotations

import hashlib
import itertools
import math
import re

import numpy as np

from app.nlp.skills import extract_skills

_TOKEN_RE = re.compile(r"[a-z0-9+#.]+")
_STOP = frozenset(
    [
        "a",
        "an",
        "the",
        "and",
        "or",
        "of",
        "to",
        "in",
        "on",
        "for",
        "with",
        "at",
        "by",
        "from",
        "as",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "this",
        "that",
        "it",
        "its",
        "we",
        "our",
        "you",
        "your",
        "i",
        "my",
        "me",
        "he",
        "she",
        "they",
        "them",
        "their",
        "will",
        "would",
        "can",
        "could",
        "should",
        "has",
        "have",
        "had",
        "do",
        "does",
        "did",
        "not",
        "no",
    ]
)


def _bucket(token: str, dim: int) -> tuple[int, float]:
    digest = hashlib.blake2b(token.encode(), digest_size=8).digest()
    value = int.from_bytes(digest, "little")
    return value % dim, (1.0 if (value >> 63) & 1 else -1.0)


class HashingEmbedder:
    name = "hashing"

    def __init__(self, dim: int = 384) -> None:
        self.dim = dim

    def _embed_one(self, text: str) -> list[float]:
        vec = np.zeros(self.dim, dtype=np.float64)
        tokens = [t.strip(".") for t in _TOKEN_RE.findall(text.lower())]
        tokens = [t for t in tokens if t and t not in _STOP]
        for tok in tokens:
            idx, sign = _bucket("u:" + tok, self.dim)
            vec[idx] += sign
        for a, b in itertools.pairwise(tokens):
            idx, sign = _bucket(f"b:{a}_{b}", self.dim)
            vec[idx] += 0.5 * sign
        for skill in extract_skills(text):
            idx, sign = _bucket("s:" + skill.lower(), self.dim)
            vec[idx] += 3.0 * sign
        # Sub-linear term frequency keeps long documents from dominating.
        vec = np.sign(vec) * np.log1p(np.abs(vec))
        norm = math.sqrt(float(np.dot(vec, vec)))
        return (vec / norm).tolist() if norm else vec.tolist()

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]
