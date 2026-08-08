from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from .errors import RateLimitExceededError


@dataclass(slots=True)
class _Bucket:
    tokens: float
    last_refill: float


class ToolRateLimiter:
    """A per-(tenant, tool) token bucket.

    Each tool declares its own ``rate_limit_per_minute``, so a cheap,
    read-only tool and an expensive or dangerous one can carry independent
    budgets, and one tenant's usage never draws from another tenant's
    bucket.
    """

    def __init__(self) -> None:
        self._buckets: dict[tuple[str, str], _Bucket] = {}
        self._lock = asyncio.Lock()

    async def acquire(self, tenant_id: str, tool_name: str, capacity_per_minute: int) -> None:
        key = (tenant_id, tool_name)
        now = time.monotonic()
        refill_per_second = capacity_per_minute / 60.0

        async with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _Bucket(tokens=float(capacity_per_minute), last_refill=now)
                self._buckets[key] = bucket

            elapsed = now - bucket.last_refill
            bucket.tokens = min(capacity_per_minute, bucket.tokens + elapsed * refill_per_second)
            bucket.last_refill = now

            if bucket.tokens < 1:
                raise RateLimitExceededError(tool_name)
            bucket.tokens -= 1
