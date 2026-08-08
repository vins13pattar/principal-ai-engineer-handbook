from __future__ import annotations

from tool_gateway.audit import AuditLog
from tool_gateway.models import CallOutcome


def test_record_and_list_all() -> None:
    log = AuditLog()
    log.record(
        agent_id="a1", tenant_id="t1", tool_name="search", outcome=CallOutcome.ALLOWED
    )
    log.record(
        agent_id="a2",
        tenant_id="t1",
        tool_name="issue_refund",
        outcome=CallOutcome.DENIED_SCOPE,
        detail="no scope",
    )

    entries = log.list()
    assert len(entries) == 2
    assert entries[1].detail == "no scope"


def test_filter_by_agent_id() -> None:
    log = AuditLog()
    log.record(agent_id="a1", tenant_id="t1", tool_name="search", outcome=CallOutcome.ALLOWED)
    log.record(agent_id="a2", tenant_id="t1", tool_name="search", outcome=CallOutcome.ALLOWED)

    entries = log.list(agent_id="a1")
    assert len(entries) == 1
    assert entries[0].agent_id == "a1"


def test_filter_by_tool_name() -> None:
    log = AuditLog()
    log.record(agent_id="a1", tenant_id="t1", tool_name="search", outcome=CallOutcome.ALLOWED)
    log.record(
        agent_id="a1", tenant_id="t1", tool_name="issue_refund", outcome=CallOutcome.ALLOWED
    )

    entries = log.list(tool_name="issue_refund")
    assert len(entries) == 1
    assert entries[0].tool_name == "issue_refund"
