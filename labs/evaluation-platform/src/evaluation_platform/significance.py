"""Whether a difference between two runs is distinguishable from noise.

The part of an evaluation platform that nobody builds, and the reason so many
"3% improvement" claims are unfalsifiable. A delta measured on a small set carries a
confidence interval wide enough to contain zero, and reporting the point estimate
without it is not a measurement — it is a hope with a decimal place.

Two-proportion normal approximation, implemented directly rather than pulled from
scipy so the arithmetic is visible and the lab has no heavy dependency. Its limits are
real and enforced in `is_significant`: the approximation degrades when the expected
count in any cell drops below about five, which is exactly the regime small eval sets
live in — so the code refuses to answer rather than answering badly.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

#: Two-sided 95% confidence.
Z_ALPHA = 1.959964
#: 80% power, the usual floor for calling a study adequately powered.
Z_POWER = 0.841621

#: Below this expected cell count the normal approximation is not trustworthy.
MIN_EXPECTED_COUNT = 5.0


@dataclass(frozen=True)
class Comparison:
    """The result of asking whether run B differs from run A."""

    baseline_correct: int
    baseline_total: int
    candidate_correct: int
    candidate_total: int

    @property
    def baseline_rate(self) -> float:
        return self.baseline_correct / self.baseline_total

    @property
    def candidate_rate(self) -> float:
        return self.candidate_correct / self.candidate_total

    @property
    def delta(self) -> float:
        """The number that goes in the changelog, on its own and meaningless."""
        return self.candidate_rate - self.baseline_rate

    @property
    def pooled_rate(self) -> float:
        return (self.baseline_correct + self.candidate_correct) / (
            self.baseline_total + self.candidate_total
        )

    def z_score(self) -> float:
        p = self.pooled_rate
        variance = p * (1 - p) * (1 / self.baseline_total + 1 / self.candidate_total)
        if variance == 0.0:
            return 0.0
        return self.delta / math.sqrt(variance)

    def approximation_is_usable(self) -> bool:
        """Guards against reporting a confident answer the maths cannot support."""
        p = self.pooled_rate
        cells = (
            self.baseline_total * p,
            self.baseline_total * (1 - p),
            self.candidate_total * p,
            self.candidate_total * (1 - p),
        )
        return min(cells) >= MIN_EXPECTED_COUNT

    def is_significant(self) -> bool | None:
        """True, False, or None for "this set cannot answer the question".

        The third case is the important one. Returning False for an underpowered
        comparison would say "no difference" when the honest answer is "no idea", and
        those get acted on very differently.
        """
        if not self.approximation_is_usable():
            return None
        return abs(self.z_score()) > Z_ALPHA

    def confidence_interval(self) -> tuple[float, float]:
        """95% interval on the delta. If it contains zero, the delta is not established."""
        a, b = self.baseline_rate, self.candidate_rate
        se = math.sqrt(
            a * (1 - a) / self.baseline_total + b * (1 - b) / self.candidate_total
        )
        margin = Z_ALPHA * se
        return (self.delta - margin, self.delta + margin)


def required_sample_size(baseline_rate: float, detectable_delta: float) -> int:
    """Examples **per arm** needed to detect `detectable_delta` at 95% / 80% power.

    The number to compute *before* building an eval set, not after failing to find a
    result with the one you have. It grows with the square of the effect you want to
    see, so halving the detectable delta quadruples the dataset.
    """
    if not 0.0 < baseline_rate < 1.0:
        raise ValueError("baseline_rate must be strictly between 0 and 1")
    if detectable_delta <= 0.0:
        raise ValueError("detectable_delta must be positive")

    candidate_rate = min(baseline_rate + detectable_delta, 0.999999)
    numerator = (Z_ALPHA + Z_POWER) ** 2 * (
        baseline_rate * (1 - baseline_rate) + candidate_rate * (1 - candidate_rate)
    )
    return math.ceil(numerator / detectable_delta**2)


def smallest_detectable_delta(baseline_rate: float, sample_size: int) -> float:
    """The inverse question: given the set you have, what can it actually see?

    Anything smaller than this is invisible to your eval regardless of how carefully
    you read the dashboard.
    """
    if sample_size <= 0:
        raise ValueError("sample_size must be positive")
    # Solved from required_sample_size with the candidate variance approximated by the
    # baseline's — exact enough for the decision this informs, which is "is my eval set
    # within an order of magnitude of adequate".
    variance = 2 * baseline_rate * (1 - baseline_rate)
    return (Z_ALPHA + Z_POWER) * math.sqrt(variance / sample_size)
