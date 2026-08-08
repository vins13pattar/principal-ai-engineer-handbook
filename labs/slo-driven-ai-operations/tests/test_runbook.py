from __future__ import annotations

import asyncio

import pytest

from platform_ops.models import (
    AlertSeverity,
    IncidentContext,
    IncidentStatus,
    MutableClock,
    RunbookAction,
    RunbookStep,
)
from platform_ops.runbook import IncidentRunner, Runbook


async def always_fails(_: IncidentContext) -> bool:
    return False


async def always_resolves(_: IncidentContext) -> bool:
    return True


async def resolves_on_third_attempt(context: IncidentContext) -> bool:
    return context.attempts >= 3


async def sleeps_past_timeout(_: IncidentContext) -> bool:
    await asyncio.sleep(10)
    return True


def _step(
    name: str, action: RunbookAction, *, timeout: float = 1.0, escalate_to: str | None
) -> RunbookStep:
    return RunbookStep(name, action, timeout_seconds=timeout, escalate_to=escalate_to)


@pytest.mark.asyncio
async def test_first_step_resolving_stops_the_runbook() -> None:
    runbook = Runbook([_step("page_on_call", always_resolves, escalate_to=None)])
    runner = IncidentRunner(runbook, clock=MutableClock())

    report = await runner.run("inc-1", "checkout-api", AlertSeverity.PAGE)

    assert report.status == IncidentStatus.RESOLVED
    assert report.final_escalation is None
    assert len(report.steps) == 1
    assert report.steps[0].resolved is True


@pytest.mark.asyncio
async def test_unresolved_steps_escalate_before_the_next_step_runs() -> None:
    runbook = Runbook(
        [
            _step("restart", always_fails, escalate_to="platform-oncall"),
            _step("scale_up", always_fails, escalate_to="incident-commander"),
            _step("page_on_call", always_resolves, escalate_to=None),
        ]
    )
    runner = IncidentRunner(runbook, clock=MutableClock())

    report = await runner.run("inc-2", "checkout-api", AlertSeverity.PAGE)

    assert report.status == IncidentStatus.RESOLVED
    assert [s.step_name for s in report.steps] == ["restart", "scale_up", "page_on_call"]
    assert report.steps[0].escalated_to == "platform-oncall"
    assert report.steps[1].escalated_to == "incident-commander"
    assert report.steps[2].escalated_to is None


@pytest.mark.asyncio
async def test_exhausted_runbook_keeps_the_last_escalation_contact() -> None:
    runbook = Runbook(
        [
            _step("restart", always_fails, escalate_to="platform-oncall"),
            _step("page_on_call", always_fails, escalate_to="sre-lead"),
        ]
    )
    runner = IncidentRunner(runbook, clock=MutableClock())

    report = await runner.run("inc-3", "checkout-api", AlertSeverity.PAGE)

    assert report.status == IncidentStatus.EXHAUSTED
    assert report.final_escalation == "sre-lead"
    assert len(report.steps) == 2


@pytest.mark.asyncio
async def test_step_exceeding_its_timeout_is_recorded_as_timed_out_and_escalates() -> None:
    runbook = Runbook(
        [
            _step("slow_step", sleeps_past_timeout, timeout=0.05, escalate_to="sre-lead"),
            _step("page_on_call", always_resolves, escalate_to=None),
        ]
    )
    runner = IncidentRunner(runbook, clock=MutableClock())

    report = await runner.run("inc-4", "checkout-api", AlertSeverity.PAGE)

    assert report.steps[0].timed_out is True
    assert report.steps[0].resolved is False
    assert report.steps[0].escalated_to == "sre-lead"
    assert report.status == IncidentStatus.RESOLVED


@pytest.mark.asyncio
async def test_context_attempts_increment_across_steps() -> None:
    runbook = Runbook(
        [
            _step("a", resolves_on_third_attempt, escalate_to="a-oncall"),
            _step("b", resolves_on_third_attempt, escalate_to="b-oncall"),
            _step("c", resolves_on_third_attempt, escalate_to=None),
        ]
    )
    runner = IncidentRunner(runbook, clock=MutableClock())

    report = await runner.run("inc-5", "checkout-api", AlertSeverity.TICKET)

    assert report.status == IncidentStatus.RESOLVED
    assert len(report.steps) == 3
