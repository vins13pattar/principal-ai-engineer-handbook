from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
import pytest
from fastapi import FastAPI

from platform_ops.app import create_app


@asynccontextmanager
async def running_client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_health() -> None:
    async with running_client(create_app()) as c:
        response = await c.get("/health")
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_recording_outcomes_for_unknown_service_returns_404() -> None:
    async with running_client(create_app()) as c:
        response = await c.post("/v1/services/does-not-exist/requests", json={"success": True})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_slo_report_reflects_recorded_outcomes() -> None:
    async with running_client(create_app()) as c:
        await c.post("/v1/services/checkout-api/requests", json={"success": True})
        await c.post("/v1/services/checkout-api/requests", json={"success": True})
        response = await c.get("/v1/services/checkout-api/slo")
    body = response.json()
    assert body["total_requests"] == 2
    assert body["failed_requests"] == 0
    assert body["severity"] == "ok"


@pytest.mark.asyncio
async def test_sustained_failures_escalate_severity_to_page() -> None:
    async with running_client(create_app()) as c:
        for _ in range(50):
            await c.post("/v1/services/checkout-api/requests", json={"success": False})
        response = await c.get("/v1/services/checkout-api/slo")
    body = response.json()
    assert body["severity"] == "page"
    assert body["budget_remaining_fraction"] < 0


@pytest.mark.asyncio
async def test_autoscale_scales_up_under_high_utilization() -> None:
    async with running_client(create_app()) as c:
        response = await c.post(
            "/v1/services/checkout-api/autoscale",
            json={"current_replicas": 4, "utilization": 0.9},
        )
    body = response.json()
    assert body["action"] == "scale_up"
    assert body["replicas"] == 5


@pytest.mark.asyncio
async def test_autoscale_for_unknown_service_returns_404() -> None:
    async with running_client(create_app()) as c:
        response = await c.post(
            "/v1/services/does-not-exist/autoscale",
            json={"current_replicas": 4, "utilization": 0.9},
        )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_incident_resolves_at_the_capacity_step_when_severity_is_ok() -> None:
    async with running_client(create_app()) as c:
        response = await c.post("/v1/incidents", json={"service": "checkout-api"})
    body = response.json()
    assert body["status"] == "resolved"
    assert [s["step_name"] for s in body["steps"]] == ["restart_service", "scale_up_capacity"]
    assert body["steps"][0]["escalated_to"] == "platform-oncall"


@pytest.mark.asyncio
async def test_incident_escalates_through_every_step_under_a_page_severity() -> None:
    async with running_client(create_app()) as c:
        for _ in range(50):
            await c.post("/v1/services/checkout-api/requests", json={"success": False})
        trigger = await c.post("/v1/incidents", json={"service": "checkout-api"})
        incident_id = trigger.json()["incident_id"]
        fetched = await c.get(f"/v1/incidents/{incident_id}")

    body = trigger.json()
    assert body["severity"] == "page"
    assert body["status"] == "resolved"
    assert [s["step_name"] for s in body["steps"]] == [
        "restart_service",
        "scale_up_capacity",
        "page_on_call",
    ]
    assert fetched.json() == body


@pytest.mark.asyncio
async def test_trigger_incident_for_unknown_service_returns_404() -> None:
    async with running_client(create_app()) as c:
        response = await c.post("/v1/incidents", json={"service": "does-not-exist"})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_unknown_incident_returns_404() -> None:
    async with running_client(create_app()) as c:
        response = await c.get("/v1/incidents/does-not-exist")
    assert response.status_code == 404
