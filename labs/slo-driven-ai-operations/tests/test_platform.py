from __future__ import annotations

import pytest

from platform_ops.errors import EmptyRunbookError, UnknownIncidentError, UnknownServiceError
from platform_ops.models import IncidentContext, MutableClock, RunbookStep, ScalingPolicy, SLOSpec
from platform_ops.platform import PlatformOperationsCenter
from platform_ops.runbook import Runbook

POLICY = ScalingPolicy(
    min_replicas=2, max_replicas=10, target_utilization=0.7, cooldown_seconds=300
)


async def resolves(_: IncidentContext) -> bool:
    return True


def _center() -> PlatformOperationsCenter:
    runbook = Runbook([RunbookStep("resolve", resolves, timeout_seconds=1.0, escalate_to=None)])
    center = PlatformOperationsCenter(runbook, clock=MutableClock())
    center.register(SLOSpec(service="checkout-api", target=0.99, window_seconds=1000), POLICY)
    return center


def test_unregistered_service_raises() -> None:
    center = _center()
    with pytest.raises(UnknownServiceError):
        center.tracker("does-not-exist")


@pytest.mark.asyncio
async def test_trigger_incident_derives_severity_from_the_slo_report() -> None:
    center = _center()

    report = await center.trigger_incident("checkout-api")

    assert report.status.value == "resolved"
    assert center.incident(report.incident_id) == report


def test_unknown_incident_raises() -> None:
    center = _center()
    with pytest.raises(UnknownIncidentError):
        center.incident("does-not-exist")


def test_empty_runbook_is_rejected() -> None:
    with pytest.raises(EmptyRunbookError):
        Runbook([])
