from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse

from .auth import Identity, JWTAuthenticator, bearer_token
from .gateway import AsyncAIGateway, GatewayOverloadedError
from .lifecycle import DrainManager, GatewayDrainingError
from .models import GenerateRequest, GenerateResponse
from .policy import enforce_provider_policy
from .providers import DemoProvider
from .rate_limit import RateLimitExceededError, TenantRateLimiter
from .runtime import Settings, configure_tracing, create_redis_quota
from .stream_telemetry import StreamTelemetry

settings = Settings()
authenticator = JWTAuthenticator(secret=settings.jwt_secret)
local_quota = TenantRateLimiter(
    capacity=settings.quota_capacity,
    refill_per_second=settings.quota_refill_per_second,
)
redis_quota = None
drain = DrainManager()
stream_metrics = StreamTelemetry()

gateway = AsyncAIGateway(
    {
        "primary": DemoProvider("primary"),
        "secondary": DemoProvider("secondary", delay_seconds=0.04),
    },
    max_concurrency=32,
)


async def current_identity(token: str = Depends(bearer_token)) -> Identity:
    return authenticator.decode(token)


async def enforce_quota(identity: Identity = Depends(current_identity)) -> Identity:
    try:
        if redis_quota is not None:
            await redis_quota.acquire(identity.tenant_id)
        else:
            await local_quota.acquire(identity.tenant_id)
    except RateLimitExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    return identity


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    global redis_quota
    configure_tracing(settings)
    try:
        redis_quota = await create_redis_quota(settings)
    except Exception:
        redis_quota = None
    yield
    gateway.begin_shutdown()
    await drain.begin_drain(timeout_seconds=30.0)


app = FastAPI(title="Secure Async AI Gateway", version="0.4.0", lifespan=lifespan)


@app.get("/health/live")
async def liveness() -> dict[str, str]:
    return {"status": "alive"}


@app.get("/health/ready")
async def readiness() -> dict[str, object]:
    if drain.draining:
        raise HTTPException(status_code=503, detail="Gateway is draining")
    return {
        "status": "ready",
        "quota_backend": "redis" if redis_quota else "local",
        "active_requests": drain.active_requests,
    }


@app.get("/metrics/streams")
async def streaming_metrics() -> dict[str, object]:
    return stream_metrics.snapshot()


@app.post("/v1/generate", response_model=GenerateResponse)
async def generate(
    request: GenerateRequest,
    identity: Identity = Depends(enforce_quota),
) -> GenerateResponse:
    enforce_provider_policy(identity, request.provider, request.timeout_seconds)
    try:
        async with drain.admitted():
            return await gateway.generate(
                request.prompt,
                provider_name=request.provider,
                timeout_seconds=request.timeout_seconds,
            )
    except GatewayDrainingError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except GatewayOverloadedError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Provider request timed out") from exc
    except ConnectionError as exc:
        raise HTTPException(status_code=502, detail="Provider unavailable") from exc


@app.post("/v1/stream")
async def stream(
    body: GenerateRequest,
    request: Request,
    identity: Identity = Depends(enforce_quota),
) -> StreamingResponse:
    enforce_provider_policy(identity, body.provider, body.timeout_seconds)

    async def events() -> AsyncIterator[str]:
        started = time.perf_counter()
        first_token_recorded = False
        try:
            async with drain.admitted():
                async for chunk in gateway.stream(body.prompt, provider_name=body.provider):
                    if await request.is_disconnected():
                        stream_metrics.record_disconnect(started)
                        return
                    if not first_token_recorded:
                        stream_metrics.record_first_token(started)
                        first_token_recorded = True
                    yield f"data: {chunk.replace(chr(10), '\\n')}\n\n"
                    await asyncio.sleep(0)
                stream_metrics.record_completion(started)
                yield "event: done\ndata: [DONE]\n\n"
        except GatewayDrainingError:
            yield "event: error\ndata: gateway_draining\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"cache-control": "no-cache", "x-accel-buffering": "no"},
    )
