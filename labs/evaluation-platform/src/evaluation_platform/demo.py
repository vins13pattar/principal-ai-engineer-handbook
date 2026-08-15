"""A dataset and a family of simulated systems with known, tunable accuracy.

DELIBERATELY SIMULATED. No model is called. Each system is a deterministic function of
(question, attempt) with a target accuracy, which is what lets the tests assert on the
statistics rather than on a model's mood.
"""

from __future__ import annotations

import hashlib

from evaluation_platform.dataset import Dataset, Example
from evaluation_platform.runner import System

RIGHT = "correct-answer"
WRONG = "incorrect-answer"


def build_dataset(size: int, *, verified: bool = True) -> Dataset:
    return Dataset(
        name=f"golden-{size}",
        examples=tuple(
            Example(
                example_id=f"e-{i:04d}",
                question=f"question {i}",
                expected=RIGHT,
                verified_by="vinod" if verified else None,
            )
            for i in range(size)
        ),
    )


def _unit(*parts: str) -> float:
    digest = hashlib.sha256("|".join(parts).encode()).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


def system_with_accuracy(accuracy: float, *, seed: str = "s") -> System:
    """Deterministic: the same question always gets the same verdict."""

    def system(question: str, attempt: int) -> str:
        return RIGHT if _unit(seed, question) < accuracy else WRONG

    return system


def flaky_system(accuracy: float, *, flaky_ids: frozenset[str], seed: str = "s") -> System:
    """Stable except on named questions, where the verdict depends on the attempt."""

    def system(question: str, attempt: int) -> str:
        if question in flaky_ids:
            return RIGHT if _unit(seed, question, str(attempt)) < 0.5 else WRONG
        return RIGHT if _unit(seed, question) < accuracy else WRONG

    return system
