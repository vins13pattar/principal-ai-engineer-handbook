from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from ai_gateway.production_app import app


@pytest.mark.asyncio
async def test_generate_returns_request_id_and_response() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/v1/generate",
            headers={"x-tenant-id": "tenant-a", "x-request-id": "req-123"},
            json={"prompt": "hello", "provider": "primary"},
        )

    assert response.status_code == 200
    assert response.headers["x-request-id"] == "req-123"
    assert response.json()["provider"] == "primary"


@pytest.mark.asyncio
async def test_prometheus_endpoint_exposes_gateway_metrics() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/metrics/prometheus")

    assert response.status_code == 200
    assert "ai_gateway_in_flight" in response.text
    assert response.headers["content-type"].startswith("text/plain")


@pytest.mark.asyncio
async def test_stream_uses_sse_framing() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/v1/stream",
            headers={"x-tenant-id": "tenant-stream"},
            json={"prompt": "stream me", "provider": "primary"},
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "data:" in response.text
    assert "event: done" in response.text
