from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass


@dataclass
class Bucket:
    tokens: float
    updated_at: float


class TenantRateLimiter:
    """In-memory token bucket keyed by tenant. Replace with Redis for multi-instance use."""

    def __init__(self, *, capacity: int = 20, refill_per_second: float = 5.0) -> None:
        self._capacity = float(capacity)
        self._refill_per_second = refill_per_second
        self._buckets: dict[str, Bucket] = {}
        self._lock = asyncio.Lock()

    async def allow(self, tenant_id: str, cost: float = 1.0) -> bool:
        now = time.monotonic()
        async with self._lock:
            bucket = self._buckets.setdefault(tenant_id, Bucket(self._capacity, now))
            elapsed = now - bucket.updated_at
            bucket.tokens = min(
                self._capacity,
                bucket.tokens + elapsed * self._refill_per_second,
            )
            bucket.updated_at = now
            if bucket.tokens < cost:
                return False
            bucket.tokens -= cost
            return True
