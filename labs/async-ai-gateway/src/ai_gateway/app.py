from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from .gateway import AsyncAIGateway, GatewayOverloadedError
from .models import GenerateRequest, GenerateResponse
from .observability import REDMetrics, log_event, new_request_id
from .providers import DemoProvider
from .rate_limit import AsyncTokenBucket, RateLimitExceededError

logging.basicConfig(level=logging.INFO, format="%(message)s")
metrics = REDMetrics()

gateway = AsyncAIGateway(
    {
        "primary": DemoProvider("primary"),
        "secondary": DemoProvider("secondary", delay_seconds=0.04),
    },
    max_concurrency=32,
    rate_limiter=AsyncTokenBucket(capacity=60, refill_per_second=10),
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    gateway.begin_shutdown()


app = FastAPI(title="Async AI Gateway Lab", version="0.2.0", lifespan=lifespan)


@app.middleware("http")
async def request_telemetry(request: Request, call_next) -> Response:
    request_id = new_request_id(request.headers.get("x-request-id"))
    operation = f"{request.method} {request.url.path}"
    log_event("request.started", method=request.method, path=request.url.path)

    with metrics.observe(operation):
        try:
            response = await call_next(request)
        except Exception as exc:
            log_event("request.failed", error=type(exc).__name__)
            raise

    response.headers["x-request-id"] = request_id
    log_event("request.completed", status_code=response.status_code)
    return response


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/metrics")
async def read_metrics() -> dict[str, object]:
    return metrics.snapshot()


@app.post("/v1/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest) -> GenerateResponse:
    try:
        return await gateway.generate(
            request.prompt,
            provider_name=request.provider,
            timeout_seconds=request.timeout_seconds,
        )
    except RateLimitExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except GatewayOverloadedError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Provider request timed out") from exc
    except ConnectionError as exc:
        raise HTTPException(status_code=502, detail="Provider unavailable") from exc


@app.post("/v1/stream")
async def stream(request: GenerateRequest) -> StreamingResponse:
    async def chunks():
        async for chunk in gateway.stream(request.prompt, provider_name=request.provider):
            yield chunk

    return StreamingResponse(chunks(), media_type="text/plain")
