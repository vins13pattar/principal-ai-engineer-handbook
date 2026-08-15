"""A deterministic stand-in for an embedding model.

DELIBERATELY SIMULATED, and the simulation choice matters, so read this before
quoting any number this lab produces.

Vectors here are lexical: tokens are hashed into a fixed number of dimensions and the
result is L2-normalised, so cosine similarity tracks token overlap. That is a crude
proxy for meaning. It is chosen for two reasons:

1. It is deterministic and needs no network, so every measurement is reproducible.
2. It reproduces the failure this lab is about — two questions with near-identical
   surface form and *different correct answers* score very highly against each other.

A real embedding model would score those pairs differently in detail. It would not
make the failure go away: "refund policy for EU customers" and "refund policy for US
customers" are genuinely close in meaning, which is exactly why a semantic cache is
tempted to treat them as the same question. Treat the *shape* of the threshold
trade-off here as the finding; do not port the specific thresholds anywhere.
"""

from __future__ import annotations

import hashlib
import math
import re

DIMENSIONS = 256

_TOKEN = re.compile(r"[a-z0-9']+")


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def embed(text: str) -> tuple[float, ...]:
    """Hash tokens into a normalised vector. Same text in, same vector out, always."""
    vector = [0.0] * DIMENSIONS
    for token in tokenize(text):
        digest = hashlib.sha256(token.encode()).digest()
        index = int.from_bytes(digest[:4], "big") % DIMENSIONS
        # A second hash bit decides the sign, so unrelated tokens colliding on a
        # dimension are as likely to cancel as to reinforce.
        sign = 1.0 if digest[4] & 1 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(v * v for v in vector))
    if norm == 0.0:
        return tuple(vector)
    return tuple(v / norm for v in vector)


def cosine(a: tuple[float, ...], b: tuple[float, ...]) -> float:
    """Both inputs are already unit vectors, so this is just the dot product."""
    return sum(x * y for x, y in zip(a, b, strict=True))
