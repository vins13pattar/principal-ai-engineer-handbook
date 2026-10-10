"""The escalation threshold: act on answers above it, hand the rest to something slower.

Two numbers per threshold, and they move against each other. Coverage is the
share of traffic the decision tier keeps; accuracy is how often it is right on
what it keeps. A decision tier pays for itself only at a point on that curve
your traffic can live with.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

from decision_tier.records import Record

Signal = Callable[[Record], float]


def top_probability(record: Record) -> float:
    return record.top


@dataclass(frozen=True)
class SweepPoint:
    threshold: float
    kept: int
    total: int
    accuracy: float  # on kept answers; 0.0 when nothing is kept

    @property
    def coverage(self) -> float:
        return self.kept / self.total


def sweep(
    records: Sequence[Record], thresholds: Sequence[float], signal: Signal = top_probability
) -> list[SweepPoint]:
    points: list[SweepPoint] = []
    for threshold in sorted(thresholds):
        kept = [r for r in records if signal(r) >= threshold]
        right = sum(r.correct for r in kept)
        points.append(
            SweepPoint(
                threshold=threshold,
                kept=len(kept),
                total=len(records),
                accuracy=right / len(kept) if kept else 0.0,
            )
        )
    return points


def fit_threshold(
    records: Sequence[Record],
    target_error: float,
    *,
    signal: Signal = top_probability,
    min_kept: int = 30,
) -> float | None:
    """The lowest threshold whose kept answers are wrong no more than ``target_error`` of the time.

    Lowest, because it keeps the most traffic. ``None`` when no threshold keeps
    at least ``min_kept`` answers at that error -- a threshold fitted on a
    handful of examples is a coincidence, not a policy.
    """
    # One pass from the most confident answer down: lowering the threshold to
    # the next distinct signal value admits every record at that value at once.
    ranked = sorted(records, key=signal, reverse=True)
    best: float | None = None
    kept = right = 0
    i = 0
    while i < len(ranked):
        value = signal(ranked[i])
        while i < len(ranked) and signal(ranked[i]) == value:
            right += ranked[i].correct
            kept += 1
            i += 1
        if kept >= min_kept and 1 - right / kept <= target_error:
            best = value
    return best
