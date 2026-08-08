from __future__ import annotations

import asyncio

import pytest

from tool_gateway.approval import ApprovalQueue
from tool_gateway.errors import (
    ApprovalAlreadyDecidedError,
    ApprovalDeniedError,
    ApprovalNotFoundError,
    ApprovalTimeoutError,
)
from tool_gateway.models import ApprovalStatus


@pytest.mark.asyncio
async def test_approve_unblocks_the_waiting_request() -> None:
    queue = ApprovalQueue()

    async def approve_soon() -> None:
        await asyncio.sleep(0.01)
        [pending] = queue.list_pending()
        queue.decide(pending.id, approve=True, decided_by="ops-oncall")

    asyncio.create_task(approve_soon())
    result = await queue.request(
        "issue_refund", "agent-1", "tenant-1", {"order_id": "o-1"}, timeout_seconds=2
    )

    assert result.status is ApprovalStatus.APPROVED
    assert result.decided_by == "ops-oncall"


@pytest.mark.asyncio
async def test_deny_raises_approval_denied_error() -> None:
    queue = ApprovalQueue()

    async def deny_soon() -> None:
        await asyncio.sleep(0.01)
        [pending] = queue.list_pending()
        queue.decide(pending.id, approve=False, decided_by="ops-oncall", reason="looks fraudulent")

    asyncio.create_task(deny_soon())
    with pytest.raises(ApprovalDeniedError, match="looks fraudulent"):
        await queue.request(
            "issue_refund", "agent-1", "tenant-1", {"order_id": "o-1"}, timeout_seconds=2
        )


@pytest.mark.asyncio
async def test_timeout_raises_approval_timeout_error_and_expires_the_request() -> None:
    queue = ApprovalQueue()

    with pytest.raises(ApprovalTimeoutError):
        await queue.request(
            "issue_refund", "agent-1", "tenant-1", {"order_id": "o-1"}, timeout_seconds=0.02
        )

    assert queue.list_pending() == []


@pytest.mark.asyncio
async def test_decide_unknown_request_raises() -> None:
    queue = ApprovalQueue()

    with pytest.raises(ApprovalNotFoundError):
        queue.decide("does-not-exist", approve=True, decided_by="ops-oncall")


@pytest.mark.asyncio
async def test_decide_already_decided_request_raises() -> None:
    queue = ApprovalQueue()

    async def approve_soon() -> None:
        await asyncio.sleep(0.01)
        [pending] = queue.list_pending()
        queue.decide(pending.id, approve=True, decided_by="ops-oncall")

    task = asyncio.create_task(approve_soon())
    result = await queue.request(
        "issue_refund", "agent-1", "tenant-1", {"order_id": "o-1"}, timeout_seconds=2
    )
    await task

    with pytest.raises(ApprovalAlreadyDecidedError):
        queue.decide(result.id, approve=True, decided_by="someone-else")


@pytest.mark.asyncio
async def test_list_pending_excludes_decided_requests() -> None:
    queue = ApprovalQueue()

    async def approve_soon() -> None:
        await asyncio.sleep(0.01)
        [pending] = queue.list_pending()
        queue.decide(pending.id, approve=True, decided_by="ops-oncall")

    task = asyncio.create_task(approve_soon())
    await queue.request(
        "issue_refund", "agent-1", "tenant-1", {"order_id": "o-1"}, timeout_seconds=2
    )
    await task

    assert queue.list_pending() == []
