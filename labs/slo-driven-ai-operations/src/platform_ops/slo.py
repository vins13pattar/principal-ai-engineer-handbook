from __future__ import annotations

from collections.abc import Sequence

from .models import (
    AlertSeverity,
    BurnRateAlertRule,
    BurnRateEvaluation,
    Clock,
    ErrorBudgetReport,
    RequestOutcome,
    SLOSpec,
    default_clock,
    severity_rank,
)

# Google SRE workbook-style multiwindow, multi-burn-rate rules: a burn rate is
# only alert-worthy if it holds over *both* a long window (avoids paging on a
# blip) and a short window (lets the alert clear quickly once burning stops).
DEFAULT_BURN_RATE_RULES: tuple[BurnRateAlertRule, ...] = (
    BurnRateAlertRule(
        severity=AlertSeverity.PAGE,
        threshold=14.4,
        long_window_seconds=3600,
        short_window_seconds=300,
    ),
    BurnRateAlertRule(
        severity=AlertSeverity.TICKET,
        threshold=6.0,
        long_window_seconds=21600,
        short_window_seconds=1800,
    ),
)


class SLOTracker:
    """Tracks request outcomes for one service and reports error-budget burn.

    Burn rate is the observed error rate divided by the error rate the SLO's
    target allows: a burn rate of 1.0 exhausts the budget exactly at the end
    of the window; a burn rate of 14.4 exhausts a 30-day budget in ~2 days.
    """

    def __init__(self, spec: SLOSpec, *, clock: Clock = default_clock) -> None:
        self._spec = spec
        self._clock = clock
        self._outcomes: list[RequestOutcome] = []

    @property
    def spec(self) -> SLOSpec:
        return self._spec

    def record(self, success: bool) -> None:
        self._outcomes.append(RequestOutcome(success=success, at=self._clock()))
        self._prune()

    def _prune(self) -> None:
        cutoff = self._clock() - self._spec.window_seconds
        self._outcomes = [o for o in self._outcomes if o.at >= cutoff]

    def _burn_rate(self, lookback_seconds: float) -> float:
        cutoff = self._clock() - lookback_seconds
        recent = [o for o in self._outcomes if o.at >= cutoff]
        if not recent:
            return 0.0
        observed_error_rate = sum(1 for o in recent if not o.success) / len(recent)
        allowed_error_rate = 1.0 - self._spec.target
        if allowed_error_rate <= 0:
            return float("inf") if observed_error_rate > 0 else 0.0
        return observed_error_rate / allowed_error_rate

    def report(
        self, rules: Sequence[BurnRateAlertRule] = DEFAULT_BURN_RATE_RULES
    ) -> ErrorBudgetReport:
        self._prune()
        total = len(self._outcomes)
        failed = sum(1 for o in self._outcomes if not o.success)
        allowed_failures = (1.0 - self._spec.target) * total
        budget_remaining = 1.0 - (failed / allowed_failures) if allowed_failures > 0 else 1.0

        evaluations: list[BurnRateEvaluation] = []
        severity = AlertSeverity.OK
        for rule in rules:
            long_rate = self._burn_rate(rule.long_window_seconds)
            short_rate = self._burn_rate(rule.short_window_seconds)
            fired = long_rate >= rule.threshold and short_rate >= rule.threshold
            evaluations.append(
                BurnRateEvaluation(
                    severity=rule.severity,
                    threshold=rule.threshold,
                    long_window_burn_rate=long_rate,
                    short_window_burn_rate=short_rate,
                    fired=fired,
                )
            )
            if fired and severity_rank(rule.severity) > severity_rank(severity):
                severity = rule.severity

        return ErrorBudgetReport(
            service=self._spec.service,
            target=self._spec.target,
            total_requests=total,
            failed_requests=failed,
            budget_remaining_fraction=budget_remaining,
            evaluations=tuple(evaluations),
            severity=severity,
        )
