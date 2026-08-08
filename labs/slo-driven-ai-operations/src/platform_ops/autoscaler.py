from __future__ import annotations

from .models import (
    AlertSeverity,
    Clock,
    ScalingAction,
    ScalingDecision,
    ScalingPolicy,
    default_clock,
)


class AutoscalingController:
    """A proportional (HPA-style) controller with a cooldown and an SLO override.

    The baseline formula mirrors Kubernetes' Horizontal Pod Autoscaler:
    ``target_replicas = current_replicas * (utilization / target_utilization)``,
    clamped to the policy's replica bounds. A cooldown prevents flapping on
    noisy utilization samples. A fast error-budget burn bypasses the cooldown
    entirely — an active outage is not something to wait out.
    """

    def __init__(self, policy: ScalingPolicy, *, clock: Clock = default_clock) -> None:
        self._policy = policy
        self._clock = clock
        self._last_scaled_at: float | None = None

    def decide(
        self, *, current_replicas: int, utilization: float, alert_severity: AlertSeverity
    ) -> ScalingDecision:
        now = self._clock()

        if (
            alert_severity == self._policy.fast_burn_severity
            and current_replicas < self._policy.max_replicas
        ):
            decision = self._clamped_decision(
                current_replicas + 1,
                current_replicas,
                "fast error-budget burn detected; scaling up despite cooldown",
            )
            self._last_scaled_at = now
            return decision

        since_last_scale = None if self._last_scaled_at is None else now - self._last_scaled_at
        cooldown = self._policy.cooldown_seconds
        in_cooldown = since_last_scale is not None and since_last_scale < cooldown
        if in_cooldown:
            return ScalingDecision(
                action=ScalingAction.HOLD,
                replicas=current_replicas,
                reason="within cooldown window since the last scaling action",
            )

        target = self._target_replicas(current_replicas, utilization)
        if target == current_replicas:
            return ScalingDecision(
                action=ScalingAction.HOLD,
                replicas=current_replicas,
                reason="utilization within target band",
            )

        comparison = "above" if target > current_replicas else "below"
        target_utilization = self._policy.target_utilization
        reason = f"utilization {utilization:.0%} {comparison} target {target_utilization:.0%}"
        decision = self._clamped_decision(target, current_replicas, reason)
        self._last_scaled_at = now
        return decision

    def _target_replicas(self, current_replicas: int, utilization: float) -> int:
        if self._policy.target_utilization <= 0:
            return current_replicas
        raw = current_replicas * (utilization / self._policy.target_utilization)
        return max(self._policy.min_replicas, min(self._policy.max_replicas, round(raw)))

    def _clamped_decision(self, target: int, current: int, reason: str) -> ScalingDecision:
        target = max(self._policy.min_replicas, min(self._policy.max_replicas, target))
        if target > current:
            action = ScalingAction.SCALE_UP
        elif target < current:
            action = ScalingAction.SCALE_DOWN
        else:
            action = ScalingAction.HOLD
        return ScalingDecision(action=action, replicas=target, reason=reason)
