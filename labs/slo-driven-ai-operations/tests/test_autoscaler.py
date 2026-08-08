from __future__ import annotations

from platform_ops.autoscaler import AutoscalingController
from platform_ops.models import AlertSeverity, MutableClock, ScalingAction, ScalingPolicy

POLICY = ScalingPolicy(
    min_replicas=2, max_replicas=10, target_utilization=0.7, cooldown_seconds=300
)


def test_scales_up_when_utilization_exceeds_target() -> None:
    controller = AutoscalingController(POLICY, clock=MutableClock())

    decision = controller.decide(
        current_replicas=4, utilization=0.9, alert_severity=AlertSeverity.OK
    )

    assert decision.action == ScalingAction.SCALE_UP
    assert decision.replicas == 5  # round(4 * 0.9 / 0.7) == 5


def test_scales_down_when_utilization_below_target() -> None:
    controller = AutoscalingController(POLICY, clock=MutableClock())

    decision = controller.decide(
        current_replicas=6, utilization=0.35, alert_severity=AlertSeverity.OK
    )

    assert decision.action == ScalingAction.SCALE_DOWN
    assert decision.replicas == 3  # round(6 * 0.35 / 0.7) == 3


def test_holds_when_utilization_matches_target() -> None:
    controller = AutoscalingController(POLICY, clock=MutableClock())

    decision = controller.decide(
        current_replicas=5, utilization=0.7, alert_severity=AlertSeverity.OK
    )

    assert decision.action == ScalingAction.HOLD
    assert decision.replicas == 5


def test_replicas_are_clamped_to_policy_bounds() -> None:
    controller = AutoscalingController(POLICY, clock=MutableClock())

    decision = controller.decide(
        current_replicas=9, utilization=1.0, alert_severity=AlertSeverity.OK
    )

    assert decision.replicas == POLICY.max_replicas


def test_second_scaling_decision_holds_within_cooldown() -> None:
    clock = MutableClock()
    controller = AutoscalingController(POLICY, clock=clock)
    first = controller.decide(current_replicas=4, utilization=0.9, alert_severity=AlertSeverity.OK)
    assert first.action == ScalingAction.SCALE_UP

    clock.advance(60)  # well under the 300s cooldown
    second = controller.decide(
        current_replicas=first.replicas, utilization=0.9, alert_severity=AlertSeverity.OK
    )

    assert second.action == ScalingAction.HOLD


def test_cooldown_expires_and_scaling_resumes() -> None:
    clock = MutableClock()
    controller = AutoscalingController(POLICY, clock=clock)
    controller.decide(current_replicas=4, utilization=0.9, alert_severity=AlertSeverity.OK)

    clock.advance(301)
    decision = controller.decide(
        current_replicas=5, utilization=0.9, alert_severity=AlertSeverity.OK
    )

    assert decision.action == ScalingAction.SCALE_UP


def test_fast_burn_overrides_cooldown() -> None:
    clock = MutableClock()
    controller = AutoscalingController(POLICY, clock=clock)
    controller.decide(current_replicas=4, utilization=0.9, alert_severity=AlertSeverity.OK)

    clock.advance(5)  # still well within cooldown
    decision = controller.decide(
        current_replicas=5, utilization=0.9, alert_severity=AlertSeverity.PAGE
    )

    assert decision.action == ScalingAction.SCALE_UP
    assert decision.replicas == 6
    assert "burn" in decision.reason


def test_fast_burn_does_not_exceed_max_replicas() -> None:
    controller = AutoscalingController(POLICY, clock=MutableClock())

    decision = controller.decide(
        current_replicas=POLICY.max_replicas, utilization=0.9, alert_severity=AlertSeverity.PAGE
    )

    assert decision.replicas == POLICY.max_replicas
