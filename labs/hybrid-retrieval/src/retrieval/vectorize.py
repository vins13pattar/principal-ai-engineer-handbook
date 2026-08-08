from __future__ import annotations

import math
import zlib
from collections.abc import Sequence

from .tokenize import tokenize

DEFAULT_DIM = 256


def _hash_index(token: str, dim: int) -> int:
    # crc32 gives a stable hash across processes and runs, unlike the
    # built-in hash() for strings, which is salted per-process.
    return zlib.crc32(token.encode("utf-8")) % dim


def embed(text: str, *, dim: int = DEFAULT_DIM) -> list[float]:
    """A deterministic, dependency-free stand-in for a real embedding model.

    This is the hashing trick: each token votes for a bucket via a stable
    hash, producing a fixed-size term-frequency vector without a learned
    vocabulary. It captures term overlap, nothing more — no synonymy, no
    word order, no semantics beyond shared tokens. A production system
    calls an actual embedding model; this exists so the retrieval pipeline
    is runnable and testable without one. See the README.
    """
    vector = [0.0] * dim
    for token in tokenize(text):
        vector[_hash_index(token, dim)] += 1.0

    norm = math.sqrt(sum(v * v for v in vector))
    if norm > 0:
        vector = [v / norm for v in vector]
    return vector


def cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    """Dot product of two already-unit-normalized vectors."""
    return sum(x * y for x, y in zip(a, b, strict=True))
