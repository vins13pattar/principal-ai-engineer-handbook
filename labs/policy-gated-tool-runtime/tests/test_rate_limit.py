from __future__ import annotations

import pytest

from tool_gateway.errors import RateLimitExceededError
from tool_gateway.rate_limit import ToolRateLimiter


@pytest.mark.asyncio
async def test_allows_up_to_capacity_then_denies(clock) -> None:
    limiter = ToolRateLimiter()

    await limiter.acquire("tenant-1", "search", capacity_per_minute=2)
    await limiter.acquire("tenant-1", "search", capacity_per_minute=2)

    with pytest.raises(RateLimitExceededError):
        await limiter.acquire("tenant-1", "search", capacity_per_minute=2)


@pytest.mark.asyncio
async def test_tokens_refill_over_time(clock) -> None:
    limiter = ToolRateLimiter()
    await limiter.acquire("tenant-1", "search", capacity_per_minute=2)
    await limiter.acquire("tenant-1", "search", capacity_per_minute=2)

    clock.advance(30)  # half a minute at 2/min refills exactly one token

    await limiter.acquire("tenant-1", "search", capacity_per_minute=2)
    with pytest.raises(RateLimitExceededError):
        await limiter.acquire("tenant-1", "search", capacity_per_minute=2)


@pytest.mark.asyncio
async def test_refill_is_capped_at_capacity(clock) -> None:
    limiter = ToolRateLimiter()
    await limiter.acquire("tenant-1", "search", capacity_per_minute=2)

    clock.advance(3600)  # an hour of idle time should not bank extra tokens

    await limiter.acquire("tenant-1", "search", capacity_per_minute=2)
    await limiter.acquire("tenant-1", "search", capacity_per_minute=2)
    with pytest.raises(RateLimitExceededError):
        await limiter.acquire("tenant-1", "search", capacity_per_minute=2)


@pytest.mark.asyncio
async def test_tenants_have_independent_buckets(clock) -> None:
    limiter = ToolRateLimiter()
    await limiter.acquire("tenant-1", "search", capacity_per_minute=1)

    with pytest.raises(RateLimitExceededError):
        await limiter.acquire("tenant-1", "search", capacity_per_minute=1)

    await limiter.acquire("tenant-2", "search", capacity_per_minute=1)


@pytest.mark.asyncio
async def test_tools_have_independent_buckets(clock) -> None:
    limiter = ToolRateLimiter()
    await limiter.acquire("tenant-1", "search", capacity_per_minute=1)

    with pytest.raises(RateLimitExceededError):
        await limiter.acquire("tenant-1", "search", capacity_per_minute=1)

    await limiter.acquire("tenant-1", "issue_refund", capacity_per_minute=1)
