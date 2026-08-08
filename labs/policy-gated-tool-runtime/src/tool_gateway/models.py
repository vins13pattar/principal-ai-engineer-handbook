from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class RiskLevel(StrEnum):
    """How much damage a tool can do if called with bad or malicious arguments.

    LOW and MEDIUM tools execute immediately once scope, schema, and rate
    checks pass. HIGH tools additionally require a human decision before
    the handler runs at all.
    """

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


ToolHandler = Callable[[dict[str, Any]], Awaitable[Any]]


@dataclass(frozen=True, slots=True)
class ToolSpec:
    """A registered tool's contract: what it does and what it may cost."""

    name: str
    description: str
    input_schema: dict[str, Any]
    risk: RiskLevel = RiskLevel.LOW
    rate_limit_per_minute: int = 60


@dataclass(frozen=True, slots=True)
class CallerIdentity:
    """The agent (not the end user) making the tool call.

    Scopes are capability strings such as ``tool:search_docs`` or the
    wildcard ``tool:*``. An agent's scopes should be the narrowest set a
    task actually requires, not everything the agent could ever need.
    """

    agent_id: str
    tenant_id: str
    scopes: frozenset[str]


class CallOutcome(StrEnum):
    ALLOWED = "allowed"
    DENIED_SCOPE = "denied_scope"
    DENIED_VALIDATION = "denied_validation"
    DENIED_RATE_LIMIT = "denied_rate_limit"
    DENIED_APPROVAL = "denied_approval"
    ERROR = "error"


@dataclass(frozen=True, slots=True)
class ToolResult:
    tool_name: str
    output: Any
    approval_id: str | None = None


class ApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    EXPIRED = "expired"


@dataclass(slots=True)
class ApprovalRequest:
    id: str
    tool_name: str
    agent_id: str
    tenant_id: str
    arguments: dict[str, Any]
    status: ApprovalStatus
    created_at: float
    decided_by: str | None = None
    reason: str | None = None


@dataclass(slots=True)
class AuditEntry:
    id: str
    timestamp: float
    agent_id: str
    tenant_id: str
    tool_name: str
    outcome: CallOutcome
    detail: str | None = None
    latency_ms: float | None = None


def new_id() -> str:
    return uuid.uuid4().hex


def now() -> float:
    return time.time()
