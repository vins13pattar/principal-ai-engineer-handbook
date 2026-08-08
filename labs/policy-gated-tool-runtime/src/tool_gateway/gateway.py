from __future__ import annotations

import time
from typing import Any

from .approval import ApprovalQueue
from .audit import AuditLog
from .errors import (
    ApprovalDeniedError,
    ApprovalTimeoutError,
    ArgumentValidationError,
    RateLimitExceededError,
    ScopeDeniedError,
    ToolNotFoundError,
)
from .models import CallerIdentity, CallOutcome, RiskLevel, ToolResult
from .rate_limit import ToolRateLimiter
from .registry import ToolRegistry, validate_arguments
from .scope import ScopePolicy

DEFAULT_APPROVAL_TIMEOUT_SECONDS = 300.0


class ToolGateway:
    """The single call path every tool invocation goes through.

    Order matters: cheap, stateless checks (scope, schema) run before
    anything that costs a shared resource (a rate-limit token) or a
    human's attention (an approval). A call denied at any stage is
    recorded in the audit log with the reason, not just dropped.
    """

    def __init__(
        self,
        registry: ToolRegistry,
        *,
        scope_policy: ScopePolicy | None = None,
        rate_limiter: ToolRateLimiter | None = None,
        approvals: ApprovalQueue | None = None,
        audit: AuditLog | None = None,
        approval_timeout_seconds: float = DEFAULT_APPROVAL_TIMEOUT_SECONDS,
    ) -> None:
        self.registry = registry
        self.scope_policy = scope_policy or ScopePolicy()
        self.rate_limiter = rate_limiter or ToolRateLimiter()
        self.approvals = approvals or ApprovalQueue()
        self.audit_log = audit or AuditLog()
        self._approval_timeout_seconds = approval_timeout_seconds

    async def call(
        self, identity: CallerIdentity, tool_name: str, arguments: dict[str, Any]
    ) -> ToolResult:
        started = time.monotonic()

        try:
            spec = self.registry.get(tool_name)
        except ToolNotFoundError as exc:
            self._deny(identity, tool_name, CallOutcome.ERROR, str(exc))
            raise

        try:
            self.scope_policy.check(identity, tool_name)
        except ScopeDeniedError as exc:
            self._deny(identity, tool_name, CallOutcome.DENIED_SCOPE, str(exc))
            raise

        try:
            validate_arguments(spec, arguments)
        except ArgumentValidationError as exc:
            self._deny(identity, tool_name, CallOutcome.DENIED_VALIDATION, str(exc))
            raise

        try:
            await self.rate_limiter.acquire(
                identity.tenant_id, tool_name, spec.rate_limit_per_minute
            )
        except RateLimitExceededError as exc:
            self._deny(identity, tool_name, CallOutcome.DENIED_RATE_LIMIT, str(exc))
            raise

        approval_id = None
        if spec.risk is RiskLevel.HIGH:
            try:
                approval = await self.approvals.request(
                    tool_name,
                    identity.agent_id,
                    identity.tenant_id,
                    arguments,
                    timeout_seconds=self._approval_timeout_seconds,
                )
            except (ApprovalDeniedError, ApprovalTimeoutError) as exc:
                self._deny(identity, tool_name, CallOutcome.DENIED_APPROVAL, str(exc))
                raise
            approval_id = approval.id

        handler = self.registry.handler_for(tool_name)
        try:
            output = await handler(arguments)
        except Exception as exc:
            detail = f"{type(exc).__name__}: {exc}"
            self._deny(identity, tool_name, CallOutcome.ERROR, detail)
            raise

        self.audit_log.record(
            agent_id=identity.agent_id,
            tenant_id=identity.tenant_id,
            tool_name=tool_name,
            outcome=CallOutcome.ALLOWED,
            latency_ms=(time.monotonic() - started) * 1000,
        )
        return ToolResult(tool_name=tool_name, output=output, approval_id=approval_id)

    def _deny(
        self, identity: CallerIdentity, tool_name: str, outcome: CallOutcome, detail: str
    ) -> None:
        self.audit_log.record(
            agent_id=identity.agent_id,
            tenant_id=identity.tenant_id,
            tool_name=tool_name,
            outcome=outcome,
            detail=detail,
        )
