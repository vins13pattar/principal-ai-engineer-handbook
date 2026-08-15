"""How an answer is scored, and what each grader cannot see.

Graders are ordered here from most trustworthy to least. That ordering is the point:
an exact-match grader is unambiguous and brittle; a judge is flexible and unverifiable.
Reaching for the flexible one because the brittle one is failing usually means the
failure was real.
"""

from __future__ import annotations

import re
from typing import Protocol

_WHITESPACE = re.compile(r"\s+")


class Grader(Protocol):
    name: str

    def grade(self, actual: str, expected: str) -> bool: ...


class ExactMatch:
    """Byte equality. No false positives, plenty of false negatives."""

    name = "exact"

    def grade(self, actual: str, expected: str) -> bool:
        return actual == expected


class NormalisedMatch:
    """Case and whitespace insensitive.

    Every normalisation step is a small decision about what does not matter. They are
    individually reasonable and collectively how a grader stops noticing real
    differences, so they are listed explicitly rather than hidden behind a `strict` flag.
    """

    name = "normalised"

    def grade(self, actual: str, expected: str) -> bool:
        return self._canonical(actual) == self._canonical(expected)

    @staticmethod
    def _canonical(text: str) -> str:
        return _WHITESPACE.sub(" ", text.strip().lower())


class ContainsExpected:
    """Passes if the expected answer appears anywhere in the output.

    The most permissive grader here, and the one that silently rewards verbosity: an
    answer containing both the right and the wrong response passes. Included because
    it is extremely common, not because it is recommended.
    """

    name = "contains"

    def grade(self, actual: str, expected: str) -> bool:
        return NormalisedMatch._canonical(expected) in NormalisedMatch._canonical(actual)
