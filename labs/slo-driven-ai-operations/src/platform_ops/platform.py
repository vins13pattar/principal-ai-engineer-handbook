from __future__ import annotations

from .autoscaler import AutoscalingController
from .errors import UnknownIncidentError, UnknownServiceError
from .models import Clock, IncidentReport, ScalingPolicy, SLOSpec, default_clock
from .runbook import IncidentRunner, Runbook
from .slo import SLOTracker


class PlatformOperationsCenter:
    """Wires per-service SLO tracking and autoscaling to a shared incident runner."""

    def __init__(self, runbook: Runbook, *, clock: Clock = default_clock) -> None:
        self._clock = clock
        self._trackers: dict[str, SLOTracker] = {}
        self._controllers: dict[str, AutoscalingController] = {}
        self._incidents: dict[str, IncidentReport] = {}
        self._incident_runner = IncidentRunner(runbook, clock=clock)
        self._next_incident_id = 0

    def register(self, spec: SLOSpec, policy: ScalingPolicy) -> None:
        self._trackers[spec.service] = SLOTracker(spec, clock=self._clock)
        self._controllers[spec.service] = AutoscalingController(policy, clock=self._clock)

    def services(self) -> list[str]:
        return list(self._trackers)

    def tracker(self, service: str) -> SLOTracker:
        try:
            return self._trackers[service]
        except KeyError:
            raise UnknownServiceError(service) from None

    def controller(self, service: str) -> AutoscalingController:
        try:
            return self._controllers[service]
        except KeyError:
            raise UnknownServiceError(service) from None

    async def trigger_incident(self, service: str) -> IncidentReport:
        report = self.tracker(service).report()
        self._next_incident_id += 1
        incident_id = f"inc-{self._next_incident_id}"
        incident = await self._incident_runner.run(incident_id, service, report.severity)
        self._incidents[incident_id] = incident
        return incident

    def incident(self, incident_id: str) -> IncidentReport:
        try:
            return self._incidents[incident_id]
        except KeyError:
            raise UnknownIncidentError(incident_id) from None
