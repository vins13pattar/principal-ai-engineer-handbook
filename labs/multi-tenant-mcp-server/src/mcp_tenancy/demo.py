from __future__ import annotations

from mcp.server import MCPServer

from .server import build_server
from .tenancy import Tenant, TenantRegistry

RESOURCE = "https://mcp.example.com"

ACME_TOKEN = "tok-acme"
GLOBEX_TOKEN = "tok-globex"
# A genuine acme token -- minted for a different server. It names a real
# tenant, so only the resource check stands between it and acme's tools.
ACME_TOKEN_FOR_ANOTHER_SERVER = "tok-acme-elsewhere"

ACME = Tenant(
    tenant_id="acme",
    tools=frozenset({"whoami", "search_docs", "issue_refund"}),
    resources=frozenset({"docs://acme/handbook"}),
)

# Deliberately a strict subset of acme's grants: globex can search but cannot
# issue refunds, so the isolation tests have something asymmetric to prove.
GLOBEX = Tenant(
    tenant_id="globex",
    tools=frozenset({"whoami", "search_docs"}),
    resources=frozenset({"docs://globex/handbook"}),
)


def build_demo_registry() -> TenantRegistry:
    registry = TenantRegistry({ACME_TOKEN: ACME, GLOBEX_TOKEN: GLOBEX}, resource=RESOURCE)
    registry.register(
        ACME_TOKEN_FOR_ANOTHER_SERVER, ACME, resource="https://other-server.example.com"
    )
    return registry


def build_demo_server() -> MCPServer:
    return build_server(build_demo_registry(), resource_server_url=RESOURCE)
