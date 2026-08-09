from __future__ import annotations

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken

from .tenancy import Tenant, TenantRegistry

# The scope every caller must hold to use the server at all. Per-tool
# authorization is a separate decision made from the tenant's grants — scopes
# here answer "may you talk to this server", not "may you call this tool".
REQUIRED_SCOPE = "mcp:use"


class TenantTokenVerifier:
    """Resolves a bearer token to a tenant identity.

    Implements the SDK's `TokenVerifier` protocol, which is the seam the
    transport calls before any request reaches a handler. That placement is the
    whole point: the credential arrives on the `Authorization` header, so it
    covers every request the transport carries — including the protocol calls
    the SDK makes on its own behalf, which application-level metadata never
    reaches. See the lab README for the failure that motivates this.
    """

    def __init__(self, registry: TenantRegistry) -> None:
        self._registry = registry

    async def verify_token(self, token: str) -> AccessToken | None:
        tenant = self._registry.verify(token)
        if tenant is None:
            return None
        return AccessToken(
            token=token,
            client_id=tenant.tenant_id,
            scopes=[REQUIRED_SCOPE],
            subject=tenant.tenant_id,
        )


def current_tenant(registry: TenantRegistry) -> Tenant | None:
    """The tenant for the in-flight request, or None if unauthenticated.

    Reads the SDK's request-scoped access token rather than any state this lab
    keeps. Under a stateless protocol there is nothing else it could safely
    read: identity is established per request, not per connection.
    """
    token = get_access_token()
    if token is None or not token.subject:
        return None
    return registry.verify(token.token)
