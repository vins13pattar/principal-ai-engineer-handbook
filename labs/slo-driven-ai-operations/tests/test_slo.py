from __future__ import annotations

from platform_ops.models import AlertSeverity, BurnRateAlertRule, MutableClock, SLOSpec
from platform_ops.slo import SLOTracker

FAST_RULE = BurnRateAlertRule(
    severity=AlertSeverity.PAGE, threshold=2.0, long_window_seconds=100, short_window_seconds=10
)


def test_all_successes_report_ok_and_full_budget() -> None:
    clock = MutableClock()
    tracker = SLOTracker(SLOSpec(service="svc", target=0.99, window_seconds=1000), clock=clock)
    for _ in range(20):
        tracker.record(success=True)

    report = tracker.report([FAST_RULE])

    assert report.severity == AlertSeverity.OK
    assert report.total_requests == 20
    assert report.failed_requests == 0
    assert report.budget_remaining_fraction == 1.0


def test_sustained_failures_exhaust_and_exceed_budget() -> None:
    clock = MutableClock()
    tracker = SLOTracker(SLOSpec(service="svc", target=0.99, window_seconds=1000), clock=clock)
    for _ in range(100):
        tracker.record(success=True)
    for _ in range(5):
        tracker.record(success=False)

    report = tracker.report([FAST_RULE])

    assert report.failed_requests == 5
    assert report.budget_remaining_fraction < 0  # over budget


def test_breach_in_both_windows_fires_the_rule() -> None:
    clock = MutableClock()
    tracker = SLOTracker(SLOSpec(service="svc", target=0.9, window_seconds=1000), clock=clock)
    for _ in range(10):
        tracker.record(success=False)

    report = tracker.report([FAST_RULE])

    assert report.severity == AlertSeverity.PAGE
    evaluation = report.evaluations[0]
    assert evaluation.fired is True
    assert evaluation.long_window_burn_rate >= FAST_RULE.threshold
    assert evaluation.short_window_burn_rate >= FAST_RULE.threshold


def test_short_only_breach_does_not_fire_without_long_window_breach() -> None:
    clock = MutableClock()
    tracker = SLOTracker(SLOSpec(service="svc", target=0.9, window_seconds=1000), clock=clock)
    for _ in range(90):
        tracker.record(success=True)

    clock.advance(95)
    for _ in range(10):
        tracker.record(success=False)

    report = tracker.report([FAST_RULE])

    evaluation = report.evaluations[0]
    assert evaluation.short_window_burn_rate >= FAST_RULE.threshold
    assert evaluation.long_window_burn_rate < FAST_RULE.threshold
    assert evaluation.fired is False
    assert report.severity == AlertSeverity.OK


def test_outcomes_outside_the_overall_window_are_pruned() -> None:
    clock = MutableClock()
    tracker = SLOTracker(SLOSpec(service="svc", target=0.99, window_seconds=50), clock=clock)
    tracker.record(success=False)
    clock.advance(60)
    tracker.record(success=True)

    report = tracker.report([FAST_RULE])

    assert report.total_requests == 1
    assert report.failed_requests == 0
