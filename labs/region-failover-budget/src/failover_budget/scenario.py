"""A simulated region, as its health probes see it.

There is no cloud here. A region is a seeded stream of probe results: healthy
by default, unhealthy during transient blips that recover on their own, and
unhealthy from the start of a sustained outage onward. In a *silent* outage the
probes stop arriving altogether -- the shape of an outage that takes the
health reporter down with the region.

The blip process is the assumption the false-failover numbers rest on, so it is
explicit and printed with every result: blips arrive as a Poisson process and
last an exponentially distributed time.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

Observation = tuple[float, bool | None]


@dataclass(frozen=True)
class Scenario:
    """Parameters for one simulated stretch of a region's life. Times are seconds."""

    duration: float = 86_400.0
    probe_interval: float = 10.0
    blips_per_hour: float = 2.0
    blip_mean_seconds: float = 20.0
    outage_at: float | None = None
    silent_outage: bool = False
    probe_loss: float = 0.0

    def describe(self) -> str:
        return (
            f"probe every {self.probe_interval:g}s; blips Poisson at {self.blips_per_hour:g}/h, "
            f"exponential duration mean {self.blip_mean_seconds:g}s; probe loss "
            f"{self.probe_loss:.0%}"
        )


def _blips(scenario: Scenario, rng: random.Random) -> list[tuple[float, float]]:
    if scenario.blips_per_hour <= 0:
        return []
    rate = scenario.blips_per_hour / 3_600.0
    blips: list[tuple[float, float]] = []
    t = rng.expovariate(rate)
    while t < scenario.duration:
        blips.append((t, t + rng.expovariate(1.0 / scenario.blip_mean_seconds)))
        t += rng.expovariate(rate)
    return blips


def timeline(scenario: Scenario, seed: int) -> list[Observation]:
    """One observation per probe interval, deterministic in ``seed``."""
    blip_rng = random.Random(f"blips:{seed}")
    loss_rng = random.Random(f"loss:{seed}")
    blips = _blips(scenario, blip_rng)

    observations: list[Observation] = []
    blip_index = 0
    steps = int(scenario.duration // scenario.probe_interval)
    for step in range(steps):
        t = step * scenario.probe_interval
        lost = loss_rng.random() < scenario.probe_loss

        if scenario.outage_at is not None and t >= scenario.outage_at:
            observations.append((t, None if scenario.silent_outage or lost else False))
            continue

        while blip_index < len(blips) and blips[blip_index][1] <= t:
            blip_index += 1
        in_blip = blip_index < len(blips) and blips[blip_index][0] <= t
        observations.append((t, None if lost else not in_blip))
    return observations
