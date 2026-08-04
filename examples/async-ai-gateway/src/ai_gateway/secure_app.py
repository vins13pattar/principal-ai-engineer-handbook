from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException

from .auth import Identity, JWTAuthenticator, bearer_token
from .gateway import AsyncAIGateway, GatewayOverloadedError
from .models import GenerateRequest, GenerateResponse
from .policy import enforce_provider_policy
from .providers import DemoProvider
from .rate_limit import RateLimitExceededError, TenantRateLimiter
from .runtime import Settings, configure_tracing, create_redis_quota

settings = Settings()
authenticator = JWTAuthenticator(secret=settings.jwt_secret)
local_quota = TenantRateLimiter(
    capacity=settings.quota_capacity,
    refill_per_second=settings.quota_refill_per_second,
)
redis_quota = None

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
async def lifespan(_: FastAPI):
    global redis_quota
    configure_tracing(settings)
    try:
        redis_quota = await create_redis_quota(settings)
    except Exception:
        redis_quota = None
    yield
    gateway.begin_shutdown()


app = FastAPI(title="Secure Async AI Gateway", version="0.3.0", lifespan=lifespan)


@app.get("/health/live")
async def liveness() -> dict[str, str]:
    return {"status": "alive"}


@app.get("/health/ready")
async def readiness() -> dict[str, str]:
    return {"status": "ready", "quota_backend": "redis" if redis_quota else "local"}


@app.post("/v1/generate", response_model=GenerateResponse)
async def generate(
    request: GenerateRequest,
    identity: Identity = Depends(enforce_quota),
) -> GenerateResponse:
    enforce_provider_policy(identity, request.provider, request.timeout_seconds)
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
