from __future__ import annotations

from mcp.server import MCPServer
from mcp.server.auth.settings import AuthSettings
from mcp.server.caching import CacheableMethod, CacheHint

from .auth import REQUIRED_SCOPE, TenantTokenVerifier, current_tenant
from .middleware import build_tenancy_middleware
from .tenancy import TenantRegistry

# SEP-2549 lets a server say how long a list result stays fresh and whether it
# is safe to share. For a tenant-scoped server the scope is the
# security-relevant half, and "private" is the whole answer rather than a
# default to accept passively.
#
# These listings are filtered per tenant. Marking them `public` would tell every
# cache on the path — client, gateway, CDN — that one tenant's filtered list may
# be served to another. The responses are genuinely cacheable, so the ttl is
# worth having; they are simply never shareable across callers.
#
# The trap is that this is a *new* way to leak tenant data: the previous
# revision had no cacheScope to get wrong.
TENANT_SCOPED_CACHE_HINTS: dict[CacheableMethod, CacheHint] = {
    "tools/list": CacheHint(ttl_ms=60_000, scope="private"),
    "resources/list": CacheHint(ttl_ms=60_000, scope="private"),
}


def build_server(
    registry: TenantRegistry,
    *,
    name: str = "multi-tenant-mcp-server",
    issuer_url: str = "https://issuer.example.com",
    resource_server_url: str = "https://mcp.example.com",
) -> MCPServer:
    """Builds a server whose every listing and invocation is tenant-scoped.

    A factory rather than a module-level singleton so tests never share a
    registry between cases — and because a stateless server has no reason to be
    a singleton in the first place.
    """
    server: MCPServer = MCPServer(
        name=name,
        version="0.1.0",
        instructions="A multi-tenant MCP server. Each request authenticates on its own.",
        token_verifier=TenantTokenVerifier(registry),
        auth=AuthSettings(
            issuer_url=issuer_url,  # type: ignore[arg-type]
            resource_server_url=resource_server_url,  # type: ignore[arg-type]
            required_scopes=[REQUIRED_SCOPE],
        ),
        middleware=[build_tenancy_middleware(registry)],
        cache_hints=TENANT_SCOPED_CACHE_HINTS,
    )

    def _tenant_id() -> str:
        tenant = current_tenant(registry)
        return tenant.tenant_id if tenant else "anonymous"

    @server.tool()
    async def whoami() -> str:
        """Return the calling tenant, as resolved from this request's credential."""
        return _tenant_id()

    @server.tool()
    async def search_docs(query: str) -> str:
        """Search this tenant's documents."""
        return f"[{_tenant_id()}] results for {query!r}"

    @server.tool()
    async def issue_refund(order_id: str, amount_cents: int) -> str:
        """Issue a refund. Granted to some tenants and not others."""
        return f"[{_tenant_id()}] refunded {amount_cents}c on order {order_id}"

    return server
