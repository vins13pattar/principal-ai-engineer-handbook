from __future__ import annotations

import logging

from fastapi import Depends, FastAPI, Header, HTTPException

from .api_models import (
    ApprovalDecisionRequest,
    ApprovalResponse,
    AuditEntryResponse,
    ToolCallRequest,
    ToolResultResponse,
    ToolSpecResponse,
)
from .demo import build_demo_registry
from .errors import (
    ApprovalAlreadyDecidedError,
    ApprovalDeniedError,
    ApprovalNotFoundError,
    ApprovalTimeoutError,
    ArgumentValidationError,
    RateLimitExceededError,
    ScopeDeniedError,
    ToolNotFoundError,
)
from .gateway import ToolGateway
from .models import CallerIdentity

logging.basicConfig(level=logging.INFO, format="%(message)s")

gateway = ToolGateway(build_demo_registry(), approval_timeout_seconds=120.0)

app = FastAPI(title="Policy-Gated Tool Runtime Lab", version="0.1.0")


def _identity(
    x_agent_id: str = Header(alias="X-Agent-Id"),
    x_tenant_id: str = Header(alias="X-Tenant-Id"),
    x_scopes: str = Header(alias="X-Scopes", default=""),
) -> CallerIdentity:
    scopes = frozenset(s.strip() for s in x_scopes.split(",") if s.strip())
    return CallerIdentity(agent_id=x_agent_id, tenant_id=x_tenant_id, scopes=scopes)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/tools", response_model=list[ToolSpecResponse])
async def list_tools() -> list[ToolSpecResponse]:
    return [ToolSpecResponse.from_spec(spec) for spec in gateway.registry.list()]


@app.post("/v1/tools/{tool_name}/call", response_model=ToolResultResponse)
async def call_tool(
    tool_name: str,
    request: ToolCallRequest,
    identity: CallerIdentity = Depends(_identity),  # noqa: B008 - required FastAPI DI pattern
) -> ToolResultResponse:
    try:
        result = await gateway.call(identity, tool_name, request.arguments)
    except ToolNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ScopeDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ArgumentValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RateLimitExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ApprovalDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ApprovalTimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    return ToolResultResponse(
        tool_name=result.tool_name, output=result.output, approval_id=result.approval_id
    )


@app.get("/v1/audit", response_model=list[AuditEntryResponse])
async def list_audit(
    agent_id: str | None = None, tool_name: str | None = None
) -> list[AuditEntryResponse]:
    entries = gateway.audit_log.list(agent_id=agent_id, tool_name=tool_name)
    return [AuditEntryResponse.from_entry(e) for e in entries]


@app.get("/v1/approvals", response_model=list[ApprovalResponse])
async def list_approvals() -> list[ApprovalResponse]:
    return [ApprovalResponse.from_request(r) for r in gateway.approvals.list_pending()]


@app.post("/v1/approvals/{approval_id}/decide", response_model=ApprovalResponse)
async def decide_approval(
    approval_id: str, request: ApprovalDecisionRequest
) -> ApprovalResponse:
    try:
        req = gateway.approvals.decide(
            approval_id,
            approve=request.approve,
            decided_by=request.decided_by,
            reason=request.reason,
        )
    except ApprovalNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ApprovalAlreadyDecidedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return ApprovalResponse.from_request(req)
