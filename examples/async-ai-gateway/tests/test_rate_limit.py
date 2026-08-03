import pytest

from ai_gateway.rate_limit import AsyncTokenBucket, RateLimitExceededError


@pytest.mark.asyncio
async def test_token_bucket_rejects_after_capacity_is_consumed() -> None:
    limiter = AsyncTokenBucket(capacity=2, refill_per_second=0.001)

    await limiter.acquire()
    await limiter.acquire()

    with pytest.raises(RateLimitExceededError):
        await limiter.acquire()
