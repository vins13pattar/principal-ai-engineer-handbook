from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from .api_models import (
    BenchmarkRequest,
    BenchmarkResponse,
    InferRequest,
    InferResponse,
    ModelVersionResponse,
)
from .benchmark import run_benchmark
from .demo import build_demo_router
from .errors import BatcherClosedError, NoServableVersionError, UnknownVersionError
from .router import CanaryRouter

logging.basicConfig(level=logging.INFO, format="%(message)s")


def create_app() -> FastAPI:
    """Build a fresh app, router, and set of batchers.

    A factory rather than a module-level singleton, because a
    ``DynamicBatcher`` cannot be restarted once shut down: each test (and
    each real process) needs its own instance rather than sharing one
    whose background task has already been torn down by a previous run.
    """
    router = build_demo_router()
    background_tasks: list[asyncio.Task[None]] = []

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        background_tasks.extend(asyncio.create_task(b.run()) for b in router.batchers())
        yield
        for batcher in router.batchers():
            await batcher.shutdown()
        for task in background_tasks:
            task.cancel()

    app = FastAPI(
        title="Dynamic Batching Inference Server Lab", version="0.6.0", lifespan=lifespan
    )
    app.state.router = router

    def _version_responses() -> list[ModelVersionResponse]:
        return [
            ModelVersionResponse.from_version(v, router.metrics(v.version))
            for v in router.list_versions()
        ]

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/infer", response_model=InferResponse)
    async def infer(request: InferRequest) -> InferResponse:
        try:
            result = await router.infer(request.payload, version=request.version)
        except UnknownVersionError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except (NoServableVersionError, BatcherClosedError) as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return InferResponse.from_result(result)

    @app.get("/v1/versions", response_model=list[ModelVersionResponse])
    async def list_versions() -> list[ModelVersionResponse]:
        return _version_responses()

    @app.post("/v1/versions/{version}/promote", response_model=list[ModelVersionResponse])
    async def promote(version: str) -> list[ModelVersionResponse]:
        try:
            router.promote(version)
        except UnknownVersionError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return _version_responses()

    @app.post("/v1/versions/{version}/rollback", response_model=list[ModelVersionResponse])
    async def rollback(version: str) -> list[ModelVersionResponse]:
        try:
            router.rollback(version)
        except UnknownVersionError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return _version_responses()

    @app.post("/v1/benchmark", response_model=BenchmarkResponse)
    async def benchmark(request: BenchmarkRequest) -> BenchmarkResponse:
        async def submit() -> None:
            await router.infer("bench-payload", version=request.version)

        report = await run_benchmark(
            submit, num_requests=request.num_requests, concurrency=request.concurrency
        )
        return BenchmarkResponse.from_report(report)

    return app


def get_router(app: FastAPI) -> CanaryRouter:
    router: CanaryRouter = app.state.router
    return router


app = create_app()
