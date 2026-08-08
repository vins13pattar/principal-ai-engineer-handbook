from __future__ import annotations

import asyncio
from collections.abc import Sequence

from .errors import EmptyRunbookError
from .models import (
    AlertSeverity,
    Clock,
    IncidentContext,
    IncidentReport,
    IncidentStatus,
    RunbookStep,
    StepExecution,
    default_clock,
)


class Runbook:
    """An ordered sequence of remediation steps, each with an escalation target."""

    def __init__(self, steps: Sequence[RunbookStep]) -> None:
        if not steps:
            raise EmptyRunbookError
        self._steps = tuple(steps)

    @property
    def steps(self) -> tuple[RunbookStep, ...]:
        return self._steps


class IncidentRunner:
    """Executes a runbook's steps in order, escalating on each unresolved step.

    Each step gets a bounded amount of time to resolve the incident. If it
    doesn't (either because it returns ``False`` or times out), the incident
    escalates to that step's contact and the next step runs. If every step
    runs out without resolving it, the incident is left with whoever the last
    step escalated to — the runbook is exhausted, not the incident.
    """

    def __init__(self, runbook: Runbook, *, clock: Clock = default_clock) -> None:
        self._runbook = runbook
        self._clock = clock

    async def run(self, incident_id: str, service: str, severity: AlertSeverity) -> IncidentReport:
        context = IncidentContext(service=service, severity=severity)
        executions: list[StepExecution] = []
        final_escalation: str | None = None

        for step in self._runbook.steps:
            context.attempts += 1
            started = self._clock()
            timed_out = False
            try:
                async with asyncio.timeout(step.timeout_seconds):
                    resolved = await step.action(context)
            except TimeoutError:
                resolved = False
                timed_out = True
            duration = self._clock() - started

            if resolved:
                executions.append(
                    StepExecution(
                        step.name,
                        resolved=True,
                        timed_out=False,
                        escalated_to=None,
                        duration_seconds=duration,
                    )
                )
                return IncidentReport(
                    incident_id=incident_id,
                    service=service,
                    severity=severity,
                    status=IncidentStatus.RESOLVED,
                    steps=tuple(executions),
                    final_escalation=None,
                )

            final_escalation = step.escalate_to
            executions.append(
                StepExecution(
                    step.name,
                    resolved=False,
                    timed_out=timed_out,
                    escalated_to=final_escalation,
                    duration_seconds=duration,
                )
            )

        return IncidentReport(
            incident_id=incident_id,
            service=service,
            severity=severity,
            status=IncidentStatus.EXHAUSTED,
            steps=tuple(executions),
            final_escalation=final_escalation,
        )
