from __future__ import annotations

import asyncio
from typing import Any

import pytest

from tool_gateway.errors import (
    ApprovalDeniedError,
    ArgumentValidationError,
    RateLimitExceededError,
    ScopeDeniedError,
    ToolNotFoundError,
)
from tool_gateway.gateway import ToolGateway
from tool_gateway.models import CallerIdentity, CallOutcome, RiskLevel, ToolSpec
from tool_gateway.registry import ToolRegistry

SEARCH_SCHEMA = {
    "type": "object",
    "properties": {"query": {"type": "string"}},
    "required": ["query"],
    "additionalProperties": False,
}

REFUND_SCHEMA = {
    "type": "object",
    "properties": {"order_id": {"type": "string"}},
    "required": ["order_id"],
    "additionalProperties": False,
}


async def search_handler(arguments: dict[str, Any]) -> Any:
    return {"results": [arguments["query"]]}


async def refund_handler(arguments: dict[str, Any]) -> Any:
    return {"refunded": arguments["order_id"]}


async def failing_handler(arguments: dict[str, Any]) -> Any:
    raise RuntimeError("payment processor unavailable")


def build_registry(*, search_limit: int = 60, refund_limit: int = 60) -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(
        ToolSpec("search", "search docs", SEARCH_SCHEMA, RiskLevel.LOW, search_limit),
        search_handler,
    )
    registry.register(
        ToolSpec("refund", "issue refund", REFUND_SCHEMA, RiskLevel.HIGH, refund_limit),
        refund_handler,
    )
    registry.register(
        ToolSpec("flaky", "always fails", REFUND_SCHEMA, RiskLevel.LOW, 60),
        failing_handler,
    )
    return registry


def identity(scopes: frozenset[str] = frozenset({"tool:*"})) -> CallerIdentity:
    return CallerIdentity(agent_id="agent-1", tenant_id="tenant-1", scopes=scopes)


@pytest.mark.asyncio
async def test_low_risk_call_succeeds_and_is_audited() -> None:
    gateway = ToolGateway(build_registry())
    result = await gateway.call(identity(), "search", {"query": "backpressure"})

    assert result.output == {"results": ["backpressure"]}
    assert result.approval_id is None
    [entry] = gateway.audit_log.list()
    assert entry.outcome is CallOutcome.ALLOWED


@pytest.mark.asyncio
async def test_unknown_tool_is_denied_and_audited() -> None:
    gateway = ToolGateway(build_registry())

    with pytest.raises(ToolNotFoundError):
        await gateway.call(identity(), "does_not_exist", {})

    [entry] = gateway.audit_log.list()
    assert entry.outcome is CallOutcome.ERROR


@pytest.mark.asyncio
async def test_missing_scope_is_denied_and_audited() -> None:
    gateway = ToolGateway(build_registry())
    scoped_identity = identity(frozenset({"tool:search"}))

    with pytest.raises(ScopeDeniedError):
        await gateway.call(scoped_identity, "refund", {"order_id": "o-1"})

    [entry] = gateway.audit_log.list()
    assert entry.outcome is CallOutcome.DENIED_SCOPE


@pytest.mark.asyncio
async def test_invalid_arguments_are_denied_and_audited() -> None:
    gateway = ToolGateway(build_registry())

    with pytest.raises(ArgumentValidationError):
        await gateway.call(identity(), "search", {"wrong_field": "x"})

    [entry] = gateway.audit_log.list()
    assert entry.outcome is CallOutcome.DENIED_VALIDATION


@pytest.mark.asyncio
async def test_rate_limited_call_is_denied_and_audited() -> None:
    gateway = ToolGateway(build_registry(search_limit=1))

    await gateway.call(identity(), "search", {"query": "first"})
    with pytest.raises(RateLimitExceededError):
        await gateway.call(identity(), "search", {"query": "second"})

    outcomes = [e.outcome for e in gateway.audit_log.list()]
    assert outcomes == [CallOutcome.ALLOWED, CallOutcome.DENIED_RATE_LIMIT]


@pytest.mark.asyncio
async def test_high_risk_call_waits_for_approval_then_succeeds() -> None:
    gateway = ToolGateway(build_registry(), approval_timeout_seconds=2)

    async def approve_soon() -> None:
        await asyncio.sleep(0.01)
        [pending] = gateway.approvals.list_pending()
        gateway.approvals.decide(pending.id, approve=True, decided_by="ops-oncall")

    asyncio.create_task(approve_soon())
    result = await gateway.call(identity(), "refund", {"order_id": "o-1"})

    assert result.output == {"refunded": "o-1"}
    assert result.approval_id is not None
    [entry] = gateway.audit_log.list()
    assert entry.outcome is CallOutcome.ALLOWED


@pytest.mark.asyncio
async def test_high_risk_call_denied_by_human_is_audited() -> None:
    gateway = ToolGateway(build_registry(), approval_timeout_seconds=2)

    async def deny_soon() -> None:
        await asyncio.sleep(0.01)
        [pending] = gateway.approvals.list_pending()
        gateway.approvals.decide(
            pending.id, approve=False, decided_by="ops-oncall", reason="suspicious amount"
        )

    asyncio.create_task(deny_soon())
    with pytest.raises(ApprovalDeniedError):
        await gateway.call(identity(), "refund", {"order_id": "o-1"})

    [entry] = gateway.audit_log.list()
    assert entry.outcome is CallOutcome.DENIED_APPROVAL


@pytest.mark.asyncio
async def test_handler_exception_is_audited_and_propagates() -> None:
    gateway = ToolGateway(build_registry())

    with pytest.raises(RuntimeError, match="payment processor unavailable"):
        await gateway.call(identity(), "flaky", {"order_id": "o-1"})

    [entry] = gateway.audit_log.list()
    assert entry.outcome is CallOutcome.ERROR
    assert "payment processor unavailable" in (entry.detail or "")
