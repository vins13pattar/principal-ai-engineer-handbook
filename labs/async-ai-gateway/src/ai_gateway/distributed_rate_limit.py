from __future__ import annotations

import time
from typing import Protocol


class RedisScriptClient(Protocol):
    async def eval(self, script: str, numkeys: int, *args: object) -> object: ...


class DistributedRateLimitExceededError(RuntimeError):
    pass


_TOKEN_BUCKET_LUA = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_second = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local ttl_seconds = tonumber(ARGV[5])

local state = redis.call('HMGET', key, 'tokens', 'updated_ms')
local tokens = tonumber(state[1])
local updated_ms = tonumber(state[2])

if tokens == nil then
  tokens = capacity
  updated_ms = now_ms
end

local elapsed_seconds = math.max(0, now_ms - updated_ms) / 1000
local replenished = math.min(capacity, tokens + elapsed_seconds * refill_per_second)
local allowed = replenished >= requested

if allowed then
  replenished = replenished - requested
end

redis.call('HSET', key, 'tokens', replenished, 'updated_ms', now_ms)
redis.call('EXPIRE', key, ttl_seconds)

if allowed then
  return {1, replenished}
end
return {0, replenished}
"""


class RedisTenantRateLimiter:
    """Atomic, cross-replica token bucket implemented with a Redis Lua script."""

    def __init__(
        self,
        redis: RedisScriptClient,
        *,
        capacity: int,
        refill_per_second: float,
        key_prefix: str = "ai-gateway:quota",
        ttl_seconds: int = 3600,
    ) -> None:
        if capacity <= 0 or refill_per_second <= 0:
            raise ValueError("capacity and refill_per_second must be positive")
        self._redis = redis
        self._capacity = capacity
        self._refill_per_second = refill_per_second
        self._key_prefix = key_prefix
        self._ttl_seconds = ttl_seconds

    async def acquire(self, tenant_id: str, tokens: int = 1) -> None:
        if not tenant_id.strip():
            raise ValueError("tenant_id must not be empty")
        if tokens <= 0:
            raise ValueError("tokens must be positive")

        key = f"{self._key_prefix}:{tenant_id}"
        result = await self._redis.eval(
            _TOKEN_BUCKET_LUA,
            1,
            key,
            self._capacity,
            self._refill_per_second,
            int(time.time() * 1000),
            tokens,
            self._ttl_seconds,
        )
        if not isinstance(result, (list, tuple)) or not result or int(result[0]) != 1:
            raise DistributedRateLimitExceededError(f"Rate limit exceeded for tenant {tenant_id}")
