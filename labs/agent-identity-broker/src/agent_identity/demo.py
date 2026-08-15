"""A small fleet to run the comparison against.

Three servers, six tools, one of them destructive — enough that "what does one
stolen token open" has a non-trivial answer, small enough to hold in your head.
"""

from __future__ import annotations

from dataclasses import dataclass

from agent_identity.blast_radius import Tool
from agent_identity.broker import TokenBroker
from agent_identity.keys import SigningKey
from agent_identity.resource_server import ResourceServer

ISSUER = "https://id.internal/"

BILLING = "https://billing.internal/mcp"
CRM = "https://crm.internal/mcp"
ADMIN = "https://admin.internal/mcp"

FLEET_TOOLS: dict[str, tuple[Tool, ...]] = {
    BILLING: (
        Tool("read_invoice", "invoice:read"),
        Tool("issue_refund", "invoice:refund"),
    ),
    CRM: (
        Tool("read_contact", "contact:read"),
        Tool("update_contact", "contact:write"),
    ),
    ADMIN: (
        Tool("list_users", "admin:read"),
        Tool("delete_user", "admin:write"),
    ),
}

#: What a support engineer can do. Deliberately broad — that breadth is the point:
#: it is what a forwarded user token hands to every server it touches.
SUPPORT_ENGINEER_SCOPES = frozenset(
    {
        "invoice:read",
        "invoice:refund",
        "contact:read",
        "contact:write",
        "admin:read",
    }
)


@dataclass(frozen=True)
class Deployment:
    """Everything wired together, so tests and the API share one construction."""

    key: SigningKey
    broker: TokenBroker
    servers: dict[str, ResourceServer]

    def fleet(self) -> dict[ResourceServer, tuple[Tool, ...]]:
        return {server: FLEET_TOOLS[uri] for uri, server in self.servers.items()}


def build_deployment() -> Deployment:
    key = SigningKey()
    broker = TokenBroker(key, issuer=ISSUER)
    servers = {
        uri: ResourceServer(
            identity=uri,
            trusted_issuer=ISSUER,
            issuer_public_key=key.public_pem,
        )
        for uri in FLEET_TOOLS
    }
    return Deployment(key=key, broker=broker, servers=servers)
