from __future__ import annotations

from pydantic import BaseModel

from .models import ErrorBudgetReport, IncidentReport, ScalingDecision


class RecordOutcomeRequest(BaseModel):
    success: bool


class BurnRateEvaluationResponse(BaseModel):
    severity: str
    threshold: float
    long_window_burn_rate: float
    short_window_burn_rate: float
    fired: bool


class SLOReportResponse(BaseModel):
    service: str
    target: float
    total_requests: int
    failed_requests: int
    budget_remaining_fraction: float
    severity: str
    evaluations: list[BurnRateEvaluationResponse]

    @classmethod
    def from_report(cls, report: ErrorBudgetReport) -> SLOReportResponse:
        return cls(
            service=report.service,
            target=report.target,
            total_requests=report.total_requests,
            failed_requests=report.failed_requests,
            budget_remaining_fraction=report.budget_remaining_fraction,
            severity=report.severity.value,
            evaluations=[
                BurnRateEvaluationResponse(
                    severity=e.severity.value,
                    threshold=e.threshold,
                    long_window_burn_rate=e.long_window_burn_rate,
                    short_window_burn_rate=e.short_window_burn_rate,
                    fired=e.fired,
                )
                for e in report.evaluations
            ],
        )


class AutoscaleRequest(BaseModel):
    current_replicas: int
    utilization: float


class AutoscaleResponse(BaseModel):
    action: str
    replicas: int
    reason: str

    @classmethod
    def from_decision(cls, decision: ScalingDecision) -> AutoscaleResponse:
        return cls(action=decision.action.value, replicas=decision.replicas, reason=decision.reason)


class StepExecutionResponse(BaseModel):
    step_name: str
    resolved: bool
    timed_out: bool
    escalated_to: str | None
    duration_seconds: float


class IncidentResponse(BaseModel):
    incident_id: str
    service: str
    severity: str
    status: str
    final_escalation: str | None
    steps: list[StepExecutionResponse]

    @classmethod
    def from_report(cls, report: IncidentReport) -> IncidentResponse:
        return cls(
            incident_id=report.incident_id,
            service=report.service,
            severity=report.severity.value,
            status=report.status.value,
            final_escalation=report.final_escalation,
            steps=[
                StepExecutionResponse(
                    step_name=s.step_name,
                    resolved=s.resolved,
                    timed_out=s.timed_out,
                    escalated_to=s.escalated_to,
                    duration_seconds=s.duration_seconds,
                )
                for s in report.steps
            ],
        )


class TriggerIncidentRequest(BaseModel):
    service: str
