"""Sweeps the similarity threshold and reports both numbers, not just the flattering one.

Hit rate alone makes any cache look good: drop the threshold far enough and everything
hits. The question a cache has to answer is what those hits cost in wrong answers.
"""

from __future__ import annotations

from dataclasses import dataclass

from semantic_cache.cache import HitKind, Scope, SemanticCache
from semantic_cache.corpus import NEAR_DUPLICATES, PARAPHRASES

SCOPE = Scope(tenant="acme", model="m-1", prompt_version="p-1")


@dataclass(frozen=True)
class ThresholdResult:
    """What one threshold setting bought and what it cost."""

    threshold: float
    true_hits: int
    false_hits: int
    misses: int

    @property
    def attempted(self) -> int:
        return self.true_hits + self.false_hits + self.misses

    @property
    def hit_rate(self) -> float:
        """The number that gets put on a slide."""
        return (self.true_hits + self.false_hits) / self.attempted if self.attempted else 0.0

    @property
    def false_hit_rate(self) -> float:
        """The number that decides whether the cache is a saving or a correctness bug.

        A false hit is not a cache miss with extra steps. It is a confidently wrong
        answer, served fast and cheap, indistinguishable downstream from a right one.
        """
        return self.false_hits / self.attempted if self.attempted else 0.0

    @property
    def precision(self) -> float:
        """Of the answers served from cache, how many were right."""
        served = self.true_hits + self.false_hits
        return self.true_hits / served if served else 1.0


def evaluate(threshold: float, *, now: float = 0.0) -> ThresholdResult:
    """Warm the cache with the first of each pair, then query with the second.

    Paraphrase pairs should hit and be right. Near-duplicate pairs should miss — if
    they hit, the served answer is wrong, and that is a false hit.
    """
    cache = SemanticCache(threshold=threshold)
    true_hits = false_hits = misses = 0

    for first, second in PARAPHRASES + NEAR_DUPLICATES:
        cache.put(first.text, first.correct_answer, SCOPE, now=now)
        result = cache.get(second.text, SCOPE, now=now)

        if result.kind is HitKind.MISS:
            misses += 1
        elif result.answer == second.correct_answer:
            true_hits += 1
        else:
            false_hits += 1

    return ThresholdResult(threshold, true_hits, false_hits, misses)


def sweep(thresholds: tuple[float, ...]) -> tuple[ThresholdResult, ...]:
    return tuple(evaluate(t) for t in thresholds)
