"""The full measurement: every trigger, over the same seeded days."""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from functools import partial

from failover_budget.budget import STANDBY_TIERS, Platform, detection_allowance, recovery
from failover_budget.scenario import Scenario
from failover_budget.simulate import TriggerFactory, detection_delays, false_failovers_per_day
from failover_budget.triggers import ConsecutiveFailures, WindowAllUnhealthy


@dataclass(frozen=True)
class SweepConfig:
    seeds: int = 30
    calm_days: float = 1.0
    rto: float = 900.0
    probe_interval: float = 10.0
    blips_per_hour: float = 4.0
    blip_mean_seconds: float = 20.0
    windows: tuple[float, ...] = (60.0, 300.0, 900.0)
    consecutive: tuple[int, ...] = (1, 3, 6, 12)
    platform: Platform = field(default_factory=Platform)

    def calm(self) -> Scenario:
        return Scenario(
            duration=self.calm_days * 86_400.0,
            probe_interval=self.probe_interval,
            blips_per_hour=self.blips_per_hour,
            blip_mean_seconds=self.blip_mean_seconds,
        )

    def outage(self, *, silent: bool = False) -> Scenario:
        # The outage starts an hour in, so every trigger has seen ordinary
        # traffic -- and ordinary blips -- before it.
        return Scenario(
            duration=2 * 3_600.0 + 2 * self.rto,
            probe_interval=self.probe_interval,
            blips_per_hour=self.blips_per_hour,
            blip_mean_seconds=self.blip_mean_seconds,
            outage_at=3_600.0,
            silent_outage=silent,
        )

    def triggers(self, *, silence_is_failure: bool = False) -> list[tuple[str, TriggerFactory]]:
        made: list[tuple[str, TriggerFactory]] = []
        for window in self.windows:
            w = WindowAllUnhealthy(window=window, silence_is_failure=silence_is_failure)
            made.append(
                (
                    w.label,
                    partial(WindowAllUnhealthy, window, silence_is_failure=silence_is_failure),
                )
            )
        for n in self.consecutive:
            c = ConsecutiveFailures(n=n, silence_is_failure=silence_is_failure)
            made.append(
                (c.label, partial(ConsecutiveFailures, n, silence_is_failure=silence_is_failure))
            )
        return made


@dataclass(frozen=True)
class TradeoffRow:
    label: str
    false_per_day: float
    median_detection: float | None
    p95_detection: float | None
    missed: int


@dataclass(frozen=True)
class BudgetRow:
    label: str
    median_detection: float | None
    totals: dict[str, float | None]


@dataclass(frozen=True)
class SilentRow:
    label: str
    detected: int
    runs: int


@dataclass(frozen=True)
class SweepResult:
    config: SweepConfig
    tradeoff: list[TradeoffRow]
    allowances: dict[str, float]
    budget: list[BudgetRow]
    silent: list[SilentRow]


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(fraction * (len(ordered) - 1))))
    return ordered[index]


def run_sweep(config: SweepConfig) -> SweepResult:
    seeds = range(config.seeds)
    calm, outage = config.calm(), config.outage()

    tradeoff: list[TradeoffRow] = []
    budget: list[BudgetRow] = []
    for label, make in config.triggers():
        delays = detection_delays(make, outage, seeds)
        measured = [d for d in delays if d is not None]
        median = statistics.median(measured) if measured else None
        tradeoff.append(
            TradeoffRow(
                label=label,
                false_per_day=false_failovers_per_day(make, calm, seeds),
                median_detection=median,
                p95_detection=_percentile(measured, 0.95) if measured else None,
                missed=len(delays) - len(measured),
            )
        )
        budget.append(
            BudgetRow(
                label=label,
                median_detection=median,
                totals={
                    name: None
                    if median is None
                    else recovery(median, config.platform, standby).total
                    for name, standby in STANDBY_TIERS.items()
                },
            )
        )

    allowances = {
        name: detection_allowance(config.rto, config.platform, standby)
        for name, standby in STANDBY_TIERS.items()
    }

    silent_scenario = config.outage(silent=True)
    silent: list[SilentRow] = []
    for rule in (False, True):
        for label, make in config.triggers(silence_is_failure=rule):
            delays = detection_delays(make, silent_scenario, seeds)
            silent.append(
                SilentRow(label, detected=sum(d is not None for d in delays), runs=len(delays))
            )

    return SweepResult(config, tradeoff, allowances, budget, silent)
