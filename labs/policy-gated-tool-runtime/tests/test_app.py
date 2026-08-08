from __future__ import annotations

import asyncio

import httpx
import pytest

from tool_gateway.app import app, gateway


def client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


def headers(agent_id: str, tenant_id: str, scopes: str) -> dict[str, str]:
    return {"X-Agent-Id": agent_id, "X-Tenant-Id": tenant_id, "X-Scopes": scopes}


@pytest.mark.asyncio
async def test_list_tools() -> None:
    async with client() as c:
        response = await c.get("/v1/tools")
    names = {t["name"] for t in response.json()}
    assert {"search_knowledge_base", "issue_refund"} <= names


@pytest.mark.asyncio
async def test_call_low_risk_tool_succeeds() -> None:
    async with client() as c:
        response = await c.post(
            "/v1/tools/search_knowledge_base/call",
            json={"arguments": {"query": "asyncio"}},
            headers=headers("agent-app-1", "tenant-app-1", "tool:search_knowledge_base"),
        )
    assert response.status_code == 200
    assert "results" in response.json()["output"]


@pytest.mark.asyncio
async def test_call_without_scope_is_rejected() -> None:
    async with client() as c:
        response = await c.post(
            "/v1/tools/issue_refund/call",
            json={"arguments": {"order_id": "o-1", "amount_usd": 10}},
            headers=headers("agent-app-2", "tenant-app-2", "tool:search_knowledge_base"),
        )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_call_with_invalid_arguments_is_rejected() -> None:
    async with client() as c:
        response = await c.post(
            "/v1/tools/search_knowledge_base/call",
            json={"arguments": {"wrong_field": "x"}},
            headers=headers("agent-app-3", "tenant-app-3", "tool:*"),
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_call_unknown_tool_returns_404() -> None:
    async with client() as c:
        response = await c.post(
            "/v1/tools/does_not_exist/call",
            json={"arguments": {}},
            headers=headers("agent-app-4", "tenant-app-4", "tool:*"),
        )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_rate_limit_exceeded_returns_429() -> None:
    tenant = "tenant-app-rate-limit"
    spec = gateway.registry.get("search_knowledge_base")
    for _ in range(spec.rate_limit_per_minute):
        await gateway.rate_limiter.acquire(
            tenant, "search_knowledge_base", spec.rate_limit_per_minute
        )

    async with client() as c:
        response = await c.post(
            "/v1/tools/search_knowledge_base/call",
            json={"arguments": {"query": "x"}},
            headers=headers("agent-app-rate-limit", tenant, "tool:*"),
        )
    assert response.status_code == 429


@pytest.mark.asyncio
async def test_high_risk_call_approved_via_http() -> None:
    async with client() as c:
        call_task = asyncio.create_task(
            c.post(
                "/v1/tools/issue_refund/call",
                json={"arguments": {"order_id": "o-http-1", "amount_usd": 25}},
                headers=headers("agent-app-5", "tenant-app-5", "tool:*"),
            )
        )

        pending = None
        for _ in range(100):
            await asyncio.sleep(0.01)
            approvals = (await c.get("/v1/approvals")).json()
            pending = next((a for a in approvals if a["agent_id"] == "agent-app-5"), None)
            if pending is not None:
                break
        assert pending is not None

        decide = await c.post(
            f"/v1/approvals/{pending['id']}/decide",
            json={"approve": True, "decided_by": "ops-oncall"},
        )
        assert decide.status_code == 200

        response = await call_task
    assert response.status_code == 200
    assert response.json()["output"]["status"] == "refunded"


@pytest.mark.asyncio
async def test_high_risk_call_denied_via_http() -> None:
    async with client() as c:
        call_task = asyncio.create_task(
            c.post(
                "/v1/tools/issue_refund/call",
                json={"arguments": {"order_id": "o-http-2", "amount_usd": 25}},
                headers=headers("agent-app-6", "tenant-app-6", "tool:*"),
            )
        )

        pending = None
        for _ in range(100):
            await asyncio.sleep(0.01)
            approvals = (await c.get("/v1/approvals")).json()
            pending = next((a for a in approvals if a["agent_id"] == "agent-app-6"), None)
            if pending is not None:
                break
        assert pending is not None

        decide = await c.post(
            f"/v1/approvals/{pending['id']}/decide",
            json={"approve": False, "decided_by": "ops-oncall", "reason": "amount looks wrong"},
        )
        assert decide.status_code == 200

        response = await call_task
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_decide_unknown_approval_returns_404() -> None:
    async with client() as c:
        response = await c.post(
            "/v1/approvals/does-not-exist/decide",
            json={"approve": True, "decided_by": "ops-oncall"},
        )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_decide_already_decided_returns_409() -> None:
    async with client() as c:
        call_task = asyncio.create_task(
            c.post(
                "/v1/tools/issue_refund/call",
                json={"arguments": {"order_id": "o-http-3", "amount_usd": 25}},
                headers=headers("agent-app-7", "tenant-app-7", "tool:*"),
            )
        )

        pending = None
        for _ in range(100):
            await asyncio.sleep(0.01)
            approvals = (await c.get("/v1/approvals")).json()
            pending = next((a for a in approvals if a["agent_id"] == "agent-app-7"), None)
            if pending is not None:
                break
        assert pending is not None

        first = await c.post(
            f"/v1/approvals/{pending['id']}/decide",
            json={"approve": True, "decided_by": "ops-oncall"},
        )
        assert first.status_code == 200

        second = await c.post(
            f"/v1/approvals/{pending['id']}/decide",
            json={"approve": True, "decided_by": "someone-else"},
        )
        assert second.status_code == 409

        await call_task


@pytest.mark.asyncio
async def test_audit_listing_via_http() -> None:
    async with client() as c:
        await c.post(
            "/v1/tools/search_knowledge_base/call",
            json={"arguments": {"query": "audit-me"}},
            headers=headers("agent-app-8", "tenant-app-8", "tool:*"),
        )
        response = await c.get("/v1/audit", params={"agent_id": "agent-app-8"})
    entries = response.json()
    assert len(entries) == 1
    assert entries[0]["tool_name"] == "search_knowledge_base"
