from __future__ import annotations

import asyncio
import time

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

    # Ejection expiry restores *eligibility*, not preference: primary is no
    # longer scored -inf and can be selected again.
    assert router.health["primary"].score(time.monotonic()) > float("-inf")


@pytest.mark.asyncio
async def test_an_untried_provider_outranks_one_that_has_recovered() -> None:
    """Pins the cold-start bias in `ProviderHealth.score`.

    `success_rate` returns 1.0 for a provider with no samples at all, so an
    untried provider scores a perfect 1.0 while one that failed twice and then
    recovered carries 1/3. The recovered provider is eligible but still ranks
    below the unknown one.

    That is defensible — an untried provider has no evidence against it — but it
    means the router explores a cold provider in preference to a known-recovered
    one, and it is worth asserting rather than rediscovering. See the README's
    known-characteristics note.
    """
    router = HealthAwareRouter(
        {"recovered": DemoProvider("recovered"), "untried": DemoProvider("untried")},
        failure_ejection_threshold=2,
        ejection_seconds=0.01,
    )
    router.record_failure("recovered")
    router.record_failure("recovered")
    await asyncio.sleep(0.02)
    router.record_success("recovered", latency_ms=1)

    now = time.monotonic()
    assert router.health["untried"].score(now) > router.health["recovered"].score(now)
    assert router.select()[0] == "untried"
