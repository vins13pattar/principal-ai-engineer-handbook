from __future__ import annotations

import pytest

from ai_gateway.distributed_rate_limit import (
    DistributedRateLimitExceededError,
    RedisTenantRateLimiter,
)


class FakeRedis:
    def __init__(self, responses: list[object]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, int, tuple[object, ...]]] = []

    async def eval(self, script: str, numkeys: int, *args: object) -> object:
        self.calls.append((script, numkeys, args))
        return self.responses.pop(0)


@pytest.mark.asyncio
async def test_distributed_limiter_uses_tenant_specific_key() -> None:
    redis = FakeRedis([[1, 9]])
    limiter = RedisTenantRateLimiter(redis, capacity=10, refill_per_second=1)

    await limiter.acquire("tenant-a")

    _, numkeys, args = redis.calls[0]
    assert numkeys == 1
    assert args[0] == "ai-gateway:quota:tenant-a"


@pytest.mark.asyncio
async def test_distributed_limiter_rejects_when_redis_script_denies() -> None:
    redis = FakeRedis([[0, 0]])
    limiter = RedisTenantRateLimiter(redis, capacity=10, refill_per_second=1)

    with pytest.raises(DistributedRateLimitExceededError):
        await limiter.acquire("tenant-a")
