from __future__ import annotations

import pytest

from ai_gateway.resilience import CircuitBreaker, CircuitOpenError, CircuitState
from ai_gateway.tenant_limits import TenantRateLimiter


@pytest.mark.asyncio
async def test_circuit_opens_after_threshold() -> None:
    breaker = CircuitBreaker(failure_threshold=2, recovery_timeout_seconds=60)
    await breaker.allow()
    breaker.record_failure()
    await breaker.allow()
    breaker.record_failure()

    assert breaker.state is CircuitState.OPEN
    with pytest.raises(CircuitOpenError):
        await breaker.allow()


@pytest.mark.asyncio
async def test_success_resets_circuit() -> None:
    breaker = CircuitBreaker(failure_threshold=2)
    breaker.record_failure()
    breaker.record_success()

    assert breaker.state is CircuitState.CLOSED
    await breaker.allow()


@pytest.mark.asyncio
async def test_tenant_limits_are_isolated() -> None:
    limiter = TenantRateLimiter(capacity=1, refill_per_second=0)

    assert await limiter.allow("tenant-a") is True
    assert await limiter.allow("tenant-a") is False
    assert await limiter.allow("tenant-b") is True
