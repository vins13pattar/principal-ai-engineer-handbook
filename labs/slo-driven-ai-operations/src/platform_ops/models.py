from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import StrEnum


class AlertSeverity(StrEnum):
    OK = "ok"
    TICKET = "ticket"
    PAGE = "page"


_SEVERITY_RANK: dict[AlertSeverity, int] = {
    AlertSeverity.OK: 0,
    AlertSeverity.TICKET: 1,
    AlertSeverity.PAGE: 2,
}


def severity_rank(severity: AlertSeverity) -> int:
    return _SEVERITY_RANK[severity]


@dataclass(frozen=True, slots=True)
class SLOSpec:
    service: str
    target: float
    window_seconds: float


@dataclass(frozen=True, slots=True)
class RequestOutcome:
    success: bool
    at: float


@dataclass(frozen=True, slots=True)
class BurnRateAlertRule:
    severity: AlertSeverity
    threshold: float
    long_window_seconds: float
    short_window_seconds: float


@dataclass(frozen=True, slots=True)
class BurnRateEvaluation:
    severity: AlertSeverity
    threshold: float
    long_window_burn_rate: float
    short_window_burn_rate: float
    fired: bool


@dataclass(frozen=True, slots=True)
class ErrorBudgetReport:
    service: str
    target: float
    total_requests: int
    failed_requests: int
    budget_remaining_fraction: float
    evaluations: tuple[BurnRateEvaluation, ...]
    severity: AlertSeverity


@dataclass(frozen=True, slots=True)
class ScalingPolicy:
    min_replicas: int
    max_replicas: int
    target_utilization: float
    cooldown_seconds: float
    fast_burn_severity: AlertSeverity = AlertSeverity.PAGE


class ScalingAction(StrEnum):
    SCALE_UP = "scale_up"
    SCALE_DOWN = "scale_down"
    HOLD = "hold"


@dataclass(frozen=True, slots=True)
class ScalingDecision:
    action: ScalingAction
    replicas: int
    reason: str


class IncidentStatus(StrEnum):
    RESOLVED = "resolved"
    EXHAUSTED = "exhausted"


@dataclass(slots=True)
class IncidentContext:
    service: str
    severity: AlertSeverity
    attempts: int = 0


RunbookAction = Callable[[IncidentContext], Awaitable[bool]]


@dataclass(frozen=True, slots=True)
class RunbookStep:
    name: str
    action: RunbookAction
    timeout_seconds: float
    escalate_to: str | None


@dataclass(frozen=True, slots=True)
class StepExecution:
    step_name: str
    resolved: bool
    timed_out: bool
    escalated_to: str | None
    duration_seconds: float


@dataclass(frozen=True, slots=True)
class IncidentReport:
    incident_id: str
    service: str
    severity: AlertSeverity
    status: IncidentStatus
    steps: tuple[StepExecution, ...]
    final_escalation: str | None


Clock = Callable[[], float]


def default_clock() -> float:
    return time.monotonic()


@dataclass(slots=True)
class MutableClock:
    """A controllable clock for deterministic tests: no real sleeping needed."""

    _now: float = field(default=0.0)

    def __call__(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds
