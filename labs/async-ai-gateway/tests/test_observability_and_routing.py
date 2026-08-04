from __future__ import annotations

import asyncio

import pytest

from ai_gateway.health_routing import HealthAwareRouter
from ai_gateway.observability import REDMetrics
from ai_gateway.providers import DemoProvider


def test_red_metrics_records_requests_errors_and_latency() -> None:
    metrics = REDMetrics()

    with metrics.observe("generate"):
        pass

    with pytest.raises(RuntimeError):
        with metrics.observe("generate"):
            raise RuntimeError("boom")

    snapshot = metrics.snapshot()
    assert snapshot["requests_total"] == {"generate": 2}
    assert snapshot["errors_total"] == {"generate": 1}
    assert snapshot["in_flight"] == 0
    assert snapshot["latency_ms"]["p50"] >= 0


@pytest.mark.asyncio
async def test_health_router_prefers_faster_successful_provider() -> None:
    router = HealthAwareRouter(
        {
            "fast": DemoProvider("fast", delay_seconds=0.001),
            "slow": DemoProvider("slow", delay_seconds=0.01),
        }
    )
    router.record_success("fast", latency_ms=10)
    router.record_success("slow", latency_ms=500)

    name, _ = router.select()
    assert name == "fast"


@pytest.mark.asyncio
async def test_health_router_ejects_repeatedly_failing_provider() -> None:
    router = HealthAwareRouter(
        {
            "primary": DemoProvider("primary"),
            "secondary": DemoProvider("secondary"),
        },
        failure_ejection_threshold=2,
        ejection_seconds=0.05,
    )
    router.record_failure("primary")
    router.record_failure("primary")

    name, _ = router.select()
    assert name == "secondary"

    await asyncio.sleep(0.06)
    router.record_success("primary", latency_ms=1)
    name, _ = router.select()
    assert name == "primary"
