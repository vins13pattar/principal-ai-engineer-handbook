"""Synthetic decision records with a known amount of miscalibration.

True class probabilities come from random logits; the label is drawn from them,
so the truth is calibrated by construction. The model's *reported*
probabilities are the same logits divided by ``overconfidence``: at 1.0 they
are calibrated, above 1.0 they are sharper than the truth. Temperature scaling
by ``overconfidence`` undoes it exactly, which is what the tests check the
fitting recovers.
"""

from __future__ import annotations

import math
import random

from decision_tier.records import Record


def _softmax(logits: list[float]) -> list[float]:
    top = max(logits)
    exps = [math.exp(x - top) for x in logits]
    total = sum(exps)
    return [e / total for e in exps]


def make_records(
    n: int, *, options: int = 4, overconfidence: float = 1.0, spread: float = 1.5, seed: int = 0
) -> list[Record]:
    rng = random.Random(seed)
    records: list[Record] = []
    for row in range(n):
        logits = [rng.gauss(0.0, spread) for _ in range(options)]
        truth = _softmax(logits)
        label = rng.choices(range(options), weights=truth)[0]
        reported = _softmax([x * overconfidence for x in logits])
        records.append(
            Record(
                dataset="synthetic", row=row, label=label, probs=tuple(reported), truncated=False
            )
        )
    return records
