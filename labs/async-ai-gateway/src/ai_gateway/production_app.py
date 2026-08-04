from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from .gateway import AsyncAIGateway, GatewayOverloadedError
from .models import GenerateRequest, GenerateResponse
from .observability import REDMetrics, log_event, new_request_id
from .providers import DemoProvider
from .rate_limit import RateLimitExceededError, TenantRateLimiter

metrics = REDMetrics()
local_limits = TenantRateLimiter(capacity=60, refill_per_second=10)

gateway = AsyncAIGateway(
    {
        "primary": DemoProvider("primary"),
        "secondary": DemoProvider("secondary", delay_seconds=0.04),
    },
    max_concurrency=32,
)


async def tenant_id(x_tenant_id: str | None = Header(default=None)) -> str:
    value = (x_tenant_id or "anonymous").strip()
    if not value:
        raise HTTPException(status_code=400, detail="x-tenant-id must not be empty")
    return value


async def enforce_quota(tenant: str = Depends(tenant_id)) -> str:
    try:
        await local_limits.acquire(tenant)
    except RateLimitExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    return tenant


@asynccontextmanager
async def lifespan(_: FastAPI):
    log_event("gateway.started", environment=os.getenv("APP_ENV", "development"))
    yield
    gateway.begin_shutdown()
    log_event("gateway.stopping")


app = FastAPI(title="Async AI Gateway Production Path", version="0.2.0", lifespan=lifespan)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = new_request_id(request.headers.get("x-request-id"))
    with metrics.observe(f"{request.method} {request.url.path}"):
        log_event("request.started", method=request.method, path=request.url.path)
        try:
            response = await call_next(request)
        except Exception as exc:
            log_event("request.failed", error=type(exc).__name__)
            raise
        response.headers["x-request-id"] = request_id
        log_event("request.completed", status_code=response.status_code)
        return response


@app.get("/health/live")
async def liveness() -> dict[str, str]:
    return {"status": "alive"}


@app.get("/health/ready")
async def readiness() -> dict[str, str]:
    return {"status": "ready"}


@app.get("/metrics")
async def red_metrics() -> dict[str, object]:
    return metrics.snapshot()


@app.post("/v1/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest, tenant: str = Depends(enforce_quota)) -> GenerateResponse:
    log_event("generation.accepted", tenant_id=tenant, provider=request.provider)
    try:
        return await gateway.generate(
            request.prompt,
            provider_name=request.provider,
            timeout_seconds=request.timeout_seconds,
        )
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
    request_body: GenerateRequest,
    request: Request,
    tenant: str = Depends(enforce_quota),
) -> StreamingResponse:
    async def event_stream() -> AsyncIterator[str]:
        log_event("stream.started", tenant_id=tenant, provider=request_body.provider)
        try:
            async for chunk in gateway.stream(
                request_body.prompt,
                provider_name=request_body.provider,
            ):
                if await request.is_disconnected():
                    log_event("stream.client_disconnected", tenant_id=tenant)
                    break
                escaped = chunk.replace("\n", "\\n")
                yield f"data: {escaped}\n\n"
                await asyncio.sleep(0)
            else:
                yield "event: done\ndata: [DONE]\n\n"
        finally:
            log_event("stream.finished", tenant_id=tenant)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"cache-control": "no-cache", "x-accel-buffering": "no"},
    )


@app.get("/metrics/prometheus")
async def prometheus_metrics() -> Response:
    snapshot = metrics.snapshot()
    requests = snapshot["requests_total"]
    errors = snapshot["errors_total"]
    latency = snapshot["latency_ms"]
    lines = [
        "# TYPE ai_gateway_in_flight gauge",
        f"ai_gateway_in_flight {snapshot['in_flight']}",
    ]
    if isinstance(requests, dict):
        for operation, value in requests.items():
            label = str(operation).replace('"', '\\"')
            lines.append(f'ai_gateway_requests_total{{operation="{label}"}} {value}')
    if isinstance(errors, dict):
        for operation, value in errors.items():
            label = str(operation).replace('"', '\\"')
            lines.append(f'ai_gateway_errors_total{{operation="{label}"}} {value}')
    if isinstance(latency, dict):
        for percentile, value in latency.items():
            lines.append(f'ai_gateway_latency_ms{{quantile="{percentile}"}} {value}')
    return Response("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")
