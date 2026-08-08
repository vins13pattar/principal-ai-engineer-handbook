from __future__ import annotations

from .models import AuditEntry, CallOutcome, new_id, now


class AuditLog:
    """An append-only record of every call attempt, allowed or not.

    Recording denials is as important as recording successes: a spike in
    ``denied_scope`` entries for one agent is a signal worth alerting on,
    not just a rejected request to discard.
    """

    def __init__(self) -> None:
        self._entries: list[AuditEntry] = []

    def record(
        self,
        *,
        agent_id: str,
        tenant_id: str,
        tool_name: str,
        outcome: CallOutcome,
        detail: str | None = None,
        latency_ms: float | None = None,
    ) -> AuditEntry:
        entry = AuditEntry(
            id=new_id(),
            timestamp=now(),
            agent_id=agent_id,
            tenant_id=tenant_id,
            tool_name=tool_name,
            outcome=outcome,
            detail=detail,
            latency_ms=latency_ms,
        )
        self._entries.append(entry)
        return entry

    def list(
        self, *, agent_id: str | None = None, tool_name: str | None = None
    ) -> list[AuditEntry]:
        entries = self._entries
        if agent_id is not None:
            entries = [e for e in entries if e.agent_id == agent_id]
        if tool_name is not None:
            entries = [e for e in entries if e.tool_name == tool_name]
        return entries
