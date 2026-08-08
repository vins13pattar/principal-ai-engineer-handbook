from __future__ import annotations

from fastapi import FastAPI, HTTPException

from .api_models import (
    AutoscaleRequest,
    AutoscaleResponse,
    IncidentResponse,
    RecordOutcomeRequest,
    SLOReportResponse,
    TriggerIncidentRequest,
)
from .demo import build_demo_runbook, build_demo_scaling_policy, build_demo_slo_spec
from .errors import UnknownIncidentError, UnknownServiceError
from .platform import PlatformOperationsCenter


def create_app() -> FastAPI:
    """Build a fresh platform operations center for each app instance.

    A factory rather than a module-level singleton so tests (and separate
    processes) never share SLO history, scaling cooldown state, or incident
    logs with each other.
    """
    center = PlatformOperationsCenter(build_demo_runbook())
    center.register(build_demo_slo_spec(), build_demo_scaling_policy())

    app = FastAPI(title="SLO Autoscaler and Incident Runbook Lab", version="0.7.0")
    app.state.center = center

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/services/{service}/requests")
    async def record_outcome(service: str, request: RecordOutcomeRequest) -> dict[str, bool]:
        try:
            center.tracker(service).record(request.success)
        except UnknownServiceError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return {"recorded": True}

    @app.get("/v1/services/{service}/slo", response_model=SLOReportResponse)
    async def slo_report(service: str) -> SLOReportResponse:
        try:
            report = center.tracker(service).report()
        except UnknownServiceError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return SLOReportResponse.from_report(report)

    @app.post("/v1/services/{service}/autoscale", response_model=AutoscaleResponse)
    async def autoscale(service: str, request: AutoscaleRequest) -> AutoscaleResponse:
        try:
            severity = center.tracker(service).report().severity
            decision = center.controller(service).decide(
                current_replicas=request.current_replicas,
                utilization=request.utilization,
                alert_severity=severity,
            )
        except UnknownServiceError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return AutoscaleResponse.from_decision(decision)

    @app.post("/v1/incidents", response_model=IncidentResponse)
    async def trigger_incident(request: TriggerIncidentRequest) -> IncidentResponse:
        try:
            report = await center.trigger_incident(request.service)
        except UnknownServiceError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return IncidentResponse.from_report(report)

    @app.get("/v1/incidents/{incident_id}", response_model=IncidentResponse)
    async def get_incident(incident_id: str) -> IncidentResponse:
        try:
            report = center.incident(incident_id)
        except UnknownIncidentError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return IncidentResponse.from_report(report)

    return app


def get_center(app: FastAPI) -> PlatformOperationsCenter:
    center: PlatformOperationsCenter = app.state.center
    return center


app = create_app()
