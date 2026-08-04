from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

from .rate_limit import RateLimitExceededError


@dataclass(frozen=True, slots=True)
class Settings:
    jwt_secret: str = os.getenv("JWT_SECRET", "development-secret")
    redis_url: str | None = os.getenv("REDIS_URL")
    otlp_endpoint: str | None = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    quota_capacity: int = int(os.getenv("QUOTA_CAPACITY", "60"))
    quota_refill_per_second: float = float(os.getenv("QUOTA_REFILL_PER_SECOND", "10"))


REDIS_TOKEN_BUCKET = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local current = redis.call('HMGET', key, 'tokens', 'updated')
local tokens = tonumber(current[1]) or capacity
local updated = tonumber(current[2]) or now
local elapsed = math.max(0, now - updated)
tokens = math.min(capacity, tokens + elapsed * refill)
if tokens < 1 then
  redis.call('HMSET', key, 'tokens', tokens, 'updated', now)
  redis.call('EXPIRE', key, math.ceil(capacity / refill) * 2)
  return 0
end
tokens = tokens - 1
redis.call('HMSET', key, 'tokens', tokens, 'updated', now)
redis.call('EXPIRE', key, math.ceil(capacity / refill) * 2)
return 1
"""


class RedisTenantQuota:
    def __init__(self, client: Any, *, capacity: int, refill_per_second: float) -> None:
        self._client = client
        self._capacity = capacity
        self._refill = refill_per_second

    async def acquire(self, tenant_id: str) -> None:
        allowed = await self._client.eval(
            REDIS_TOKEN_BUCKET,
            1,
            f"ai-gateway:quota:{tenant_id}",
            self._capacity,
            self._refill,
            time.time(),
        )
        if int(allowed) != 1:
            raise RateLimitExceededError(f"Tenant rate limit exceeded: {tenant_id}")


async def create_redis_quota(settings: Settings) -> RedisTenantQuota | None:
    if not settings.redis_url:
        return None
    from redis.asyncio import Redis

    client = Redis.from_url(settings.redis_url, decode_responses=True)
    await client.ping()
    return RedisTenantQuota(
        client,
        capacity=settings.quota_capacity,
        refill_per_second=settings.quota_refill_per_second,
    )


def configure_tracing(settings: Settings) -> None:
    if not settings.otlp_endpoint:
        return
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    provider = TracerProvider(resource=Resource.create({"service.name": "async-ai-gateway"}))
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{settings.otlp_endpoint.rstrip('/')}/v1/traces"))
    )
    trace.set_tracer_provider(provider)
