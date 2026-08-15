"""Golden examples, and the flag that marks the ones nobody has actually checked."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Example:
    """One graded case.

    `verified_by` is not decoration. An eval set accumulates examples whose "expected"
    output was produced by the system under test and never independently checked —
    at which point the eval measures agreement with a past self rather than
    correctness, and cannot detect a regression that was always there.
    """

    example_id: str
    question: str
    expected: str
    verified_by: str | None = None

    @property
    def is_verified(self) -> bool:
        return self.verified_by is not None


@dataclass(frozen=True)
class Dataset:
    name: str
    examples: tuple[Example, ...]

    def __len__(self) -> int:
        return len(self.examples)

    @property
    def verified_fraction(self) -> float:
        if not self.examples:
            return 0.0
        return sum(e.is_verified for e in self.examples) / len(self.examples)
