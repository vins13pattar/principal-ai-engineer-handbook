"""Integration tests for the distributed rate limiter, against a real Redis.

`test_distributed_rate_limit.py` uses a fake that records the call and returns a
canned answer. That is worth having — it pins the key naming and the refusal
path — but it cannot check the thing the Lua script exists for. The script's
whole reason to be is that check-and-decrement happens *inside* Redis, so two
gateway replicas racing on the same tenant cannot both be told yes. A fake that
returns `[1, 9]` will happily say yes to both.

So these tests run the actual script against an actual Redis, and the last one
fires 2x capacity concurrent acquires through two limiter instances sharing one
Redis. Exactly `capacity` may succeed.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest

from ai_gateway.distributed_rate_limit import (
    DistributedRateLimitExceededError,
    RedisTenantRateLimiter,
)


@pytest.fixture
async def redis_client() -> AsyncIterator[Any]:
    """A real Redis connection, or an honest refusal.

    Skipping is the right default -- most people running the suite have no
    Redis, and the general `quality` job has no service container.

    But a job whose entire purpose is to exercise a real server must not be
    allowed to go green by skipping. So the integration job sets
    `REDIS_INTEGRATION_REQUIRED=1`, and under that flag a missing or
    unreachable `REDIS_URL` is a failure rather than a skip. That is the exact
    failure this file was added for: the job used to select tests with
    `-k redis`, which matched only the fake-backed unit tests, so the Redis
    service container was started and then never touched by anything. The job
    was green whether or not Redis existed.

    Note that keying this off `CI` would not work -- GitHub Actions sets `CI`
    for every job, including the one with no Redis attached.
    """
    url = os.environ.get("REDIS_URL")
    required = bool(os.environ.get("REDIS_INTEGRATION_REQUIRED"))
    if not url:
        if required:
            pytest.fail(
                "REDIS_INTEGRATION_REQUIRED is set but REDIS_URL is not. This job "
                "would have passed without connecting to Redis at all."
            )
        pytest.skip("set REDIS_URL (e.g. redis://localhost:6379/0) to run these")

    try:
        import redis.asyncio as redis_asyncio
    except ImportError:  # pragma: no cover - depends on which extras are installed
        # Same reasoning: skipping here is fine unless this is the job that is
        # supposed to be proving the Redis path works.
        if required:
            pytest.fail("the redis extra is not installed: pip install -e '.[redis]'")
        pytest.skip("the redis extra is not installed: pip install -e '.[redis]'")

    client = redis_asyncio.from_url(url, decode_responses=False)
    try:
        await client.ping()
    except Exception as exc:  # pragma: no cover - only on a broken environment
        await client.aclose()
        pytest.fail(f"REDIS_URL={url} is set but unreachable: {exc!r}")
    try:
        yield client
    finally:
        await client.aclose()


def _unique_tenant() -> str:
    """Tests share a Redis; they must not share keys."""
    return f"tenant-{uuid.uuid4().hex}"


async def test_the_bucket_starts_full_and_empties_at_capacity(redis_client: Any) -> None:
    tenant = _unique_tenant()
    limiter = RedisTenantRateLimiter(redis_client, capacity=5, refill_per_second=0.001)

    for _ in range(5):
        await limiter.acquire(tenant)

    with pytest.raises(DistributedRateLimitExceededError):
        await limiter.acquire(tenant)


async def test_tokens_come_back_as_time_passes(redis_client: Any) -> None:
    tenant = _unique_tenant()
    # 20/second means a single token is back in 50ms.
    limiter = RedisTenantRateLimiter(redis_client, capacity=2, refill_per_second=20)

    await limiter.acquire(tenant)
    await limiter.acquire(tenant)
    with pytest.raises(DistributedRateLimitExceededError):
        await limiter.acquire(tenant)

    await asyncio.sleep(0.15)
    await limiter.acquire(tenant)


async def test_one_tenant_cannot_spend_anothers_quota(redis_client: Any) -> None:
    noisy = _unique_tenant()
    quiet = _unique_tenant()
    limiter = RedisTenantRateLimiter(redis_client, capacity=3, refill_per_second=0.001)

    for _ in range(3):
        await limiter.acquire(noisy)
    with pytest.raises(DistributedRateLimitExceededError):
        await limiter.acquire(noisy)

    await limiter.acquire(quiet)


async def test_the_key_expires_so_idle_tenants_do_not_accumulate(redis_client: Any) -> None:
    """Without the EXPIRE, every tenant ever seen is a permanent key."""
    tenant = _unique_tenant()
    limiter = RedisTenantRateLimiter(
        redis_client, capacity=2, refill_per_second=1, ttl_seconds=60
    )

    await limiter.acquire(tenant)

    ttl = await redis_client.ttl(f"ai-gateway:quota:{tenant}")
    assert 0 < ttl <= 60


async def test_two_replicas_racing_cannot_both_be_told_yes(redis_client: Any) -> None:
    """The property the fake cannot test.

    Two limiter instances, one Redis, one tenant, twice the capacity fired at
    once. If check-and-decrement were not atomic inside Redis, more than
    `capacity` would get through -- that is the classic read-modify-write race,
    and it is why this is a Lua script rather than a GET and a SET.
    """
    tenant = _unique_tenant()
    capacity = 20
    replica_a = RedisTenantRateLimiter(redis_client, capacity=capacity, refill_per_second=0.001)
    replica_b = RedisTenantRateLimiter(redis_client, capacity=capacity, refill_per_second=0.001)

    async def attempt(limiter: RedisTenantRateLimiter) -> bool:
        try:
            await limiter.acquire(tenant)
        except DistributedRateLimitExceededError:
            return False
        return True

    replicas = [replica_a, replica_b]
    outcomes = await asyncio.gather(
        *(attempt(replicas[i % 2]) for i in range(capacity * 2))
    )

    assert sum(outcomes) == capacity
