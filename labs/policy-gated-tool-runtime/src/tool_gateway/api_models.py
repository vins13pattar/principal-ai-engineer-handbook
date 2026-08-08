from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from .models import ApprovalRequest, ApprovalStatus, AuditEntry, CallOutcome, RiskLevel, ToolSpec


class ToolCallRequest(BaseModel):
    arguments: dict[str, Any] = Field(default_factory=dict)


class ToolResultResponse(BaseModel):
    tool_name: str
    output: Any
    approval_id: str | None


class ToolSpecResponse(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any]
    risk: RiskLevel
    rate_limit_per_minute: int

    @classmethod
    def from_spec(cls, spec: ToolSpec) -> ToolSpecResponse:
        return cls(
            name=spec.name,
            description=spec.description,
            input_schema=spec.input_schema,
            risk=spec.risk,
            rate_limit_per_minute=spec.rate_limit_per_minute,
        )


class AuditEntryResponse(BaseModel):
    id: str
    timestamp: float
    agent_id: str
    tenant_id: str
    tool_name: str
    outcome: CallOutcome
    detail: str | None
    latency_ms: float | None

    @classmethod
    def from_entry(cls, entry: AuditEntry) -> AuditEntryResponse:
        return cls(
            id=entry.id,
            timestamp=entry.timestamp,
            agent_id=entry.agent_id,
            tenant_id=entry.tenant_id,
            tool_name=entry.tool_name,
            outcome=entry.outcome,
            detail=entry.detail,
            latency_ms=entry.latency_ms,
        )


class ApprovalResponse(BaseModel):
    id: str
    tool_name: str
    agent_id: str
    tenant_id: str
    arguments: dict[str, Any]
    status: ApprovalStatus
    created_at: float
    decided_by: str | None
    reason: str | None

    @classmethod
    def from_request(cls, req: ApprovalRequest) -> ApprovalResponse:
        return cls(
            id=req.id,
            tool_name=req.tool_name,
            agent_id=req.agent_id,
            tenant_id=req.tenant_id,
            arguments=req.arguments,
            status=req.status,
            created_at=req.created_at,
            decided_by=req.decided_by,
            reason=req.reason,
        )


class ApprovalDecisionRequest(BaseModel):
    approve: bool
    decided_by: str = Field(min_length=1)
    reason: str | None = None
