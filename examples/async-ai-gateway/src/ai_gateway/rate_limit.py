from __future__ import annotations

import asyncio
import time


class RateLimitExceededError(RuntimeError):
    pass


class AsyncTokenBucket:
    """In-process token bucket for learning purposes.

    Production multi-instance gateways should use a shared limiter backed by Redis,
    an API gateway, or another strongly coordinated quota service.
    """

    def __init__(self, *, capacity: int, refill_per_second: float) -> None:
        if capacity <= 0 or refill_per_second <= 0:
            raise ValueError("capacity and refill_per_second must be positive")
        self._capacity = float(capacity)
        self._tokens = float(capacity)
        self._refill_per_second = refill_per_second
        self._updated_at = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._updated_at
            self._tokens = min(
                self._capacity,
                self._tokens + elapsed * self._refill_per_second,
            )
            self._updated_at = now
            if self._tokens < 1:
                raise RateLimitExceededError("Gateway rate limit exceeded")
            self._tokens -= 1


class TenantRateLimiter:
    """Creates an isolated in-memory token bucket for each tenant.

    This is suitable for a single-process lab. Multi-replica deployments need
    distributed enforcement through Redis, an API gateway, or a quota service.
    """

    def __init__(self, *, capacity: int, refill_per_second: float) -> None:
        if capacity <= 0 or refill_per_second <= 0:
            raise ValueError("capacity and refill_per_second must be positive")
        self._capacity = capacity
        self._refill_per_second = refill_per_second
        self._buckets: dict[str, AsyncTokenBucket] = {}
        self._lock = asyncio.Lock()

    async def acquire(self, tenant_id: str) -> None:
        if not tenant_id:
            raise ValueError("tenant_id must not be empty")
        async with self._lock:
            bucket = self._buckets.get(tenant_id)
            if bucket is None:
                bucket = AsyncTokenBucket(
                    capacity=self._capacity,
                    refill_per_second=self._refill_per_second,
                )
                self._buckets[tenant_id] = bucket
        await bucket.acquire()
