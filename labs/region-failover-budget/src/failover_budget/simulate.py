"""Run triggers over simulated regions and measure both sides of the trade.

A trigger that fires is assumed to fail over. It then stays quiet until the
region next reports healthy, and starts again with no history -- so one blip is
at most one false failover. Without that, a long blip would be counted once per
probe it lasted: a freshly reset window trigger fires on its very first
unhealthy probe, because with no history that probe is every check in the
window. That flaw is real (see ``tests/test_triggers.py``), but it belongs to a
controller restart, not to the rate this measures.

Counting fires in a stretch with no outage gives false failovers; the first
fire after an outage starts gives the detection delay.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable

from failover_budget.scenario import Observation, Scenario, timeline
from failover_budget.triggers import Trigger

TriggerFactory = Callable[[], Trigger]


def fire_times(trigger: Trigger, observations: Iterable[Observation]) -> list[float]:
    """Every time the trigger fires, each fire followed by quiet until the region is healthy."""
    fires: list[float] = []
    failed_over = False
    for now, healthy in observations:
        if failed_over:
            if healthy is not True:
                continue
            failed_over = False
            trigger.reset()
        if trigger.observe(now, healthy):
            fires.append(now)
            failed_over = True
    return fires


def false_failovers_per_day(
    make_trigger: TriggerFactory, scenario: Scenario, seeds: Iterable[int]
) -> float:
    """Mean failovers per simulated day in a scenario with no real outage."""
    if scenario.outage_at is not None:
        raise ValueError("false failovers are measured on a scenario with no outage")
    seeds = list(seeds)
    total = sum(len(fire_times(make_trigger(), timeline(scenario, seed))) for seed in seeds)
    days = len(seeds) * scenario.duration / 86_400.0
    return total / days


def detection_delays(
    make_trigger: TriggerFactory, scenario: Scenario, seeds: Iterable[int]
) -> list[float | None]:
    """Per seed, seconds from outage start to the first fire after it; None if it never fired."""
    if scenario.outage_at is None:
        raise ValueError("detection is measured on a scenario with an outage")
    outage_at = scenario.outage_at
    delays: list[float | None] = []
    for seed in seeds:
        observations = timeline(scenario, seed)
        fires = fire_times(make_trigger(), observations)
        before = [t for t in fires if t < outage_at]
        after = [t for t in fires if t >= outage_at]
        if before and not any(ok is True for t, ok in observations if before[-1] < t < outage_at):
            # Fired on a blip that never recovered -- it ran straight into the
            # outage. The region was already failed over when the outage began.
            delays.append(0.0)
        else:
            delays.append(after[0] - outage_at if after else None)
    return delays
