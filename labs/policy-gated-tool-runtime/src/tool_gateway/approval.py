from __future__ import annotations

import asyncio
from typing import Any

from .errors import (
    ApprovalAlreadyDecidedError,
    ApprovalDeniedError,
    ApprovalNotFoundError,
    ApprovalTimeoutError,
)
from .models import ApprovalRequest, ApprovalStatus, new_id, now


class ApprovalQueue:
    """Blocks a high-risk call until a human approves, denies, or the request expires.

    ``request`` is the caller-side half of the handshake: it creates a
    pending record and suspends the calling coroutine on an
    :class:`asyncio.Event`. ``decide`` is the human-side half: it is called
    from a separate request (an operator console, a Slack action, an
    on-call approval endpoint) and wakes the waiting coroutine.
    """

    def __init__(self) -> None:
        self._requests: dict[str, ApprovalRequest] = {}
        self._events: dict[str, asyncio.Event] = {}

    async def request(
        self,
        tool_name: str,
        agent_id: str,
        tenant_id: str,
        arguments: dict[str, Any],
        *,
        timeout_seconds: float,
    ) -> ApprovalRequest:
        req = ApprovalRequest(
            id=new_id(),
            tool_name=tool_name,
            agent_id=agent_id,
            tenant_id=tenant_id,
            arguments=arguments,
            status=ApprovalStatus.PENDING,
            created_at=now(),
        )
        event = asyncio.Event()
        self._requests[req.id] = req
        self._events[req.id] = event

        try:
            async with asyncio.timeout(timeout_seconds):
                await event.wait()
        except TimeoutError:
            req.status = ApprovalStatus.EXPIRED
            raise ApprovalTimeoutError(tool_name) from None

        if req.status is ApprovalStatus.DENIED:
            raise ApprovalDeniedError(tool_name, req.reason)
        return req

    def decide(
        self, request_id: str, *, approve: bool, decided_by: str, reason: str | None = None
    ) -> ApprovalRequest:
        req = self._requests.get(request_id)
        if req is None:
            raise ApprovalNotFoundError(request_id)
        if req.status is not ApprovalStatus.PENDING:
            raise ApprovalAlreadyDecidedError(request_id)

        req.status = ApprovalStatus.APPROVED if approve else ApprovalStatus.DENIED
        req.decided_by = decided_by
        req.reason = reason
        self._events[request_id].set()
        return req

    def get(self, request_id: str) -> ApprovalRequest:
        req = self._requests.get(request_id)
        if req is None:
            raise ApprovalNotFoundError(request_id)
        return req

    def list_pending(self) -> list[ApprovalRequest]:
        return [r for r in self._requests.values() if r.status is ApprovalStatus.PENDING]
