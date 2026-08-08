from __future__ import annotations

import asyncio

from .models import AlertSeverity, IncidentContext, RunbookStep, ScalingPolicy, SLOSpec
from .runbook import Runbook


async def restart_service(_: IncidentContext) -> bool:
    await asyncio.sleep(0.01)
    return False  # a plain restart doesn't fix a genuine capacity or dependency problem


async def scale_up_capacity(context: IncidentContext) -> bool:
    await asyncio.sleep(0.01)
    # extra capacity resolves a slow ticket-level burn; a fast page-level burn
    # usually means something is actively broken, not just under-provisioned
    return context.severity != AlertSeverity.PAGE


async def page_on_call(_: IncidentContext) -> bool:
    await asyncio.sleep(0.01)
    return True  # a human always resolves it, eventually, in this demo


def build_demo_runbook() -> Runbook:
    return Runbook(
        [
            RunbookStep(
                name="restart_service",
                action=restart_service,
                timeout_seconds=2.0,
                escalate_to="platform-oncall",
            ),
            RunbookStep(
                name="scale_up_capacity",
                action=scale_up_capacity,
                timeout_seconds=2.0,
                escalate_to="incident-commander",
            ),
            RunbookStep(
                name="page_on_call",
                action=page_on_call,
                timeout_seconds=2.0,
                escalate_to=None,
            ),
        ]
    )


def build_demo_slo_spec(service: str = "checkout-api") -> SLOSpec:
    return SLOSpec(service=service, target=0.999, window_seconds=30 * 24 * 3600)


def build_demo_scaling_policy() -> ScalingPolicy:
    return ScalingPolicy(
        min_replicas=2,
        max_replicas=10,
        target_utilization=0.7,
        cooldown_seconds=300,
    )
