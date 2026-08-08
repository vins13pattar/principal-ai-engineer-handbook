from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
import pytest
from fastapi import FastAPI

from inference.app import create_app


@asynccontextmanager
async def running_client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    # ASGITransport does not drive the ASGI lifespan protocol, so without
    # this the batcher's background run() task never starts and /v1/infer
    # hangs forever waiting on a batch that nothing ever flushes.
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c


@pytest.mark.asyncio
async def test_health() -> None:
    async with running_client(create_app()) as c:
        response = await c.get("/health")
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_infer_without_explicit_version_routes_to_a_known_version() -> None:
    async with running_client(create_app()) as c:
        response = await c.post("/v1/infer", json={"payload": 42})
    assert response.status_code == 200
    body = response.json()
    assert body["version"] in {"stable-v1", "canary-v2"}
    assert body["latency_ms"] >= 0


@pytest.mark.asyncio
async def test_infer_with_explicit_version() -> None:
    async with running_client(create_app()) as c:
        response = await c.post("/v1/infer", json={"payload": 7, "version": "canary-v2"})
    assert response.status_code == 200
    assert response.json()["version"] == "canary-v2"


@pytest.mark.asyncio
async def test_infer_with_unknown_version_returns_404() -> None:
    async with running_client(create_app()) as c:
        response = await c.post("/v1/infer", json={"payload": 1, "version": "does-not-exist"})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_versions_shows_both_demo_versions() -> None:
    async with running_client(create_app()) as c:
        response = await c.get("/v1/versions")
    versions = {v["version"] for v in response.json()}
    assert versions == {"stable-v1", "canary-v2"}


@pytest.mark.asyncio
async def test_benchmark_endpoint_reports_percentiles() -> None:
    async with running_client(create_app()) as c:
        response = await c.post(
            "/v1/benchmark", json={"num_requests": 20, "concurrency": 5, "version": "canary-v2"}
        )
    body = response.json()
    assert body["total_requests"] == 20
    assert body["p50_latency_ms"] <= body["p95_latency_ms"] <= body["p99_latency_ms"]
    assert body["throughput_rps"] > 0


@pytest.mark.asyncio
async def test_promote_and_rollback_change_traffic_weights() -> None:
    async with running_client(create_app()) as c:
        promoted = await c.post("/v1/versions/canary-v2/promote")
        weights = {v["version"]: v["weight"] for v in promoted.json()}
        assert weights == {"stable-v1": 0.0, "canary-v2": 1.0}

        after_infer = await c.post("/v1/infer", json={"payload": 1})
        assert after_infer.json()["version"] == "canary-v2"

        rolled_back = await c.post("/v1/versions/canary-v2/rollback")
        weights = {v["version"]: v["weight"] for v in rolled_back.json()}
        assert weights["canary-v2"] == 0.0


@pytest.mark.asyncio
async def test_promote_unknown_version_returns_404() -> None:
    async with running_client(create_app()) as c:
        response = await c.post("/v1/versions/does-not-exist/promote")
    assert response.status_code == 404
