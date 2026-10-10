"""Accuracy, calibration error, and temperature scaling over decision records.

Pure Python on purpose: the analysis half of the lab runs in CI with no torch,
no numpy, and no model. Record counts are in the thousands, which this handles
in well under a second.
"""

from __future__ import annotations

import hashlib
import math
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, replace

from decision_tier.records import Record

_EPS = 1e-12


def accuracy(records: Sequence[Record]) -> float:
    return sum(r.correct for r in records) / len(records)


def majority_baseline(records: Sequence[Record]) -> float:
    """The accuracy of always answering the most common label."""
    return Counter(r.label for r in records).most_common(1)[0][1] / len(records)


def random_baseline(records: Sequence[Record]) -> float:
    return sum(1 / r.options for r in records) / len(records)


def ece(records: Sequence[Record], bins: int = 15) -> float:
    """Expected calibration error over the top answer, in equal-width bins.

    The gap between how sure the model said it was and how often it was right,
    averaged over bins weighted by how many answers fell in each.
    """
    buckets: list[list[Record]] = [[] for _ in range(bins)]
    for r in records:
        buckets[min(int(r.top * bins), bins - 1)].append(r)
    total = len(records)
    error = 0.0
    for bucket in buckets:
        if bucket:
            confidence = sum(r.top for r in bucket) / len(bucket)
            error += abs(accuracy(bucket) - confidence) * len(bucket) / total
    return error


@dataclass(frozen=True)
class ReliabilityBin:
    low: float
    high: float
    count: int
    confidence: float  # mean top probability in the bin; 0.0 when empty
    accuracy: float  # share right in the bin; 0.0 when empty


def reliability(records: Sequence[Record], bins: int = 5) -> list[ReliabilityBin]:
    """Stated confidence against actual accuracy, per equal-width bin of top probability.

    ECE is one number; this is where it comes from. A model can be
    overconfident in one range and underconfident in another, which a single
    temperature cannot fix -- and which only shows up bin by bin.
    """
    buckets: list[list[Record]] = [[] for _ in range(bins)]
    for r in records:
        buckets[min(int(r.top * bins), bins - 1)].append(r)
    rows: list[ReliabilityBin] = []
    for i, bucket in enumerate(buckets):
        rows.append(
            ReliabilityBin(
                low=i / bins,
                high=(i + 1) / bins,
                count=len(bucket),
                confidence=sum(r.top for r in bucket) / len(bucket) if bucket else 0.0,
                accuracy=accuracy(bucket) if bucket else 0.0,
            )
        )
    return rows


def typesafe_confidence(probs: Sequence[float]) -> float:
    """TypeSafe's ``confidence`` for a choice: how far the top probability sits above uniform.

    ``(p_max - 1/n) / (1 - 1/n)`` -- a measure of how concentrated the
    distribution is, rescaled by option count. Not a probability of being right.
    """
    n = len(probs)
    return (max(probs) - 1 / n) / (1 - 1 / n)


def _scaled(probs: Sequence[float], temperature: float) -> tuple[float, ...]:
    logits = [math.log(max(p, _EPS)) / temperature for p in probs]
    top = max(logits)
    exps = [math.exp(x - top) for x in logits]
    total = sum(exps)
    return tuple(e / total for e in exps)


def apply_temperature(records: Sequence[Record], temperature: float) -> list[Record]:
    """Rescale every record's probabilities. Above 1 softens; the argmax never moves."""
    return [replace(r, probs=_scaled(r.probs, temperature)) for r in records]


def _nll(records: Sequence[Record], temperature: float) -> float:
    return -sum(math.log(max(_scaled(r.probs, temperature)[r.label], _EPS)) for r in records) / len(
        records
    )


def fit_temperature(records: Sequence[Record]) -> float:
    """The single temperature that minimises negative log-likelihood, by golden-section search.

    Searched over log-temperature in [-3, 3] -- a range from far sharper to far
    softer than any model this lab has seen -- where the objective is unimodal.
    """
    lo, hi = -3.0, 3.0
    ratio = (math.sqrt(5) - 1) / 2
    a, b = hi - ratio * (hi - lo), lo + ratio * (hi - lo)
    fa, fb = _nll(records, math.exp(a)), _nll(records, math.exp(b))
    for _ in range(60):
        if fa < fb:
            hi, b, fb = b, a, fa
            a = hi - ratio * (hi - lo)
            fa = _nll(records, math.exp(a))
        else:
            lo, a, fa = a, b, fb
            b = lo + ratio * (hi - lo)
            fb = _nll(records, math.exp(b))
    return math.exp((lo + hi) / 2)


def split(records: Sequence[Record], seed: int) -> tuple[list[Record], list[Record]]:
    """Two disjoint halves -- fit on one, judge on the other -- stable across runs and machines.

    Assignment hashes the dataset name, row, and seed, so it does not depend on
    record order or on Python's per-process hash randomisation.
    """
    fit: list[Record] = []
    held_out: list[Record] = []
    for r in records:
        digest = hashlib.sha256(f"{seed}:{r.dataset}:{r.row}".encode()).digest()
        (fit if digest[0] % 2 == 0 else held_out).append(r)
    return fit, held_out
