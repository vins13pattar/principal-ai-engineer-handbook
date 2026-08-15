"""The shapes that cross a trust boundary."""

from __future__ import annotations

from dataclasses import dataclass, field

from pydantic import BaseModel, Field


@dataclass(frozen=True)
class AgentPrincipal:
    """Who is calling, and on whose behalf.

    `subject` is the human. `actor` is the agent, read from the RFC 8693 `act` claim,
    and is None when the token carries no delegation — which is exactly the case the
    audit log needs to distinguish.
    """

    subject: str
    actor: str | None
    audience: str
    scopes: frozenset[str] = field(default_factory=frozenset)

    def describe(self) -> str:
        """The audit-log rendering: never just the user when an agent was involved."""
        return f"{self.actor} acting for {self.subject}" if self.actor else self.subject


class ExchangeRequest(BaseModel):
    """An RFC 8693 token exchange, in the subset this lab implements.

    `resource` (RFC 8707) is required rather than optional: it is the input that makes
    a correct audience possible, and a broker that lets callers omit it will mint
    unbounded tokens by default.
    """

    subject_token: str
    resource: str = Field(description="Canonical URI of the server the token is for")
    scopes: frozenset[str] = Field(description="Requested scopes; narrowed, never widened")
    actor: str = Field(description="Identity of the agent that will act")
