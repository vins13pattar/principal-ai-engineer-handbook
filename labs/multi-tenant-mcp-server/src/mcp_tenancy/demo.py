from __future__ import annotations

from mcp.server import MCPServer

from .server import build_server
from .tenancy import Tenant, TenantRegistry

ACME_TOKEN = "tok-acme"
GLOBEX_TOKEN = "tok-globex"

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
    return TenantRegistry({ACME_TOKEN: ACME, GLOBEX_TOKEN: GLOBEX})


def build_demo_server() -> MCPServer:
    return build_server(build_demo_registry())
