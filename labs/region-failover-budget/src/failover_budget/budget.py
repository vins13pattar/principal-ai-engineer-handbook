"""The recovery-time budget a failover has to fit inside.

    recovery = detection + promotion + traffic shift + standby warm-up

Detection is the one stage this lab measures. The rest belong to the reader's
platform -- how long a database promotion takes, what the DNS TTL is, how fast
model weights load onto a GPU -- so they are **configured inputs, not
measurements**, and every report that uses them says so. The defaults are
deliberately round numbers in a plausible range, not anyone's benchmark.

For AI serving, warm-up is the stage that is different in kind. A standby that
is not already holding the model in GPU memory has to load it, and at 140 GB
that is minutes, not seconds.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Standby:
    """How ready the standby region is before the failover starts."""

    name: str
    needs_capacity: bool
    needs_weights: bool


STANDBY_TIERS: dict[str, Standby] = {
    "hot": Standby("hot", needs_capacity=False, needs_weights=False),
    "warm": Standby("warm", needs_capacity=False, needs_weights=True),
    "cold": Standby("cold", needs_capacity=True, needs_weights=True),
}


@dataclass(frozen=True)
class Platform:
    """The downstream stages of a failover, in seconds. Inputs, not measurements."""

    promotion_seconds: float = 60.0
    traffic_shift_seconds: float = 120.0
    capacity_seconds: float = 600.0
    model_gb: float = 140.0
    weight_load_gb_per_second: float = 1.0

    def warmup(self, standby: Standby) -> float:
        seconds = 0.0
        if standby.needs_capacity:
            seconds += self.capacity_seconds
        if standby.needs_weights:
            seconds += self.model_gb / self.weight_load_gb_per_second
        return seconds

    def downstream(self, standby: Standby) -> float:
        return self.promotion_seconds + self.traffic_shift_seconds + self.warmup(standby)

    def describe(self) -> str:
        return (
            f"promotion {self.promotion_seconds:g}s, "
            f"traffic shift {self.traffic_shift_seconds:g}s, "
            f"capacity {self.capacity_seconds:g}s, {self.model_gb:g} GB of weights at "
            f"{self.weight_load_gb_per_second:g} GB/s"
        )


@dataclass(frozen=True)
class Recovery:
    detection: float
    promotion: float
    traffic_shift: float
    warmup: float

    @property
    def total(self) -> float:
        return self.detection + self.promotion + self.traffic_shift + self.warmup

    def breaches(self, rto: float) -> bool:
        return self.total > rto

    def detection_share(self, rto: float) -> float:
        return self.detection / rto


def recovery(detection: float, platform: Platform, standby: Standby) -> Recovery:
    return Recovery(
        detection=detection,
        promotion=platform.promotion_seconds,
        traffic_shift=platform.traffic_shift_seconds,
        warmup=platform.warmup(standby),
    )


def detection_allowance(rto: float, platform: Platform, standby: Standby) -> float:
    """The longest detection that still meets the RTO. Negative means no trigger can."""
    return rto - platform.downstream(standby)
