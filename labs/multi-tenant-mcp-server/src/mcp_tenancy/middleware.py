from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .auth import current_tenant
from .tenancy import TenantRegistry

# Methods that read or act on tenant-owned data. Everything else — notably
# `server/discover` — describes the *server*, not any tenant.
#
# Getting this boundary wrong in either direction is a real bug. Too narrow and
# a tenant-scoped method serves unscoped data; too wide and the server demands
# credentials for the very call a client makes to learn how to authenticate.
#
# `server/discover` was verified to return capability flags and supported
# protocol versions only — no tool or resource names — which is what makes it
# safe to leave outside. That is a property of this server's response, not a
# general guarantee.
TENANT_SCOPED_METHODS = frozenset(
    {
        "tools/list",
        "tools/call",
        "resources/list",
        "resources/read",
        "resources/templates/list",
        "prompts/list",
        "prompts/get",
        "completion/complete",
    }
)


def _filter_listing(
    result: Any, collection: str, key: str, granted: Callable[[str], bool]
) -> Any:
    """Filters one listing down to the entries a tenant may see.

    Middleware runs below model serialization, so `result` is the outbound dict
    (`{"tools": [...], "cacheScope": ..., "resultType": ...}`) rather than a
    `ListToolsResult`. Rebuilding the dict instead of mutating it keeps the
    protocol fields exactly as the SDK produced them.
    """
    if not isinstance(result, dict):
        return result
    entries = result.get(collection)
    if not isinstance(entries, list):
        return result
    return {
        **result,
        collection: [e for e in entries if isinstance(e, dict) and granted(str(e.get(key, "")))],
    }


def _unknown_tool_result(name: str) -> dict[str, Any]:
    """The refusal returned when a tenant calls a tool it was not granted.

    Deliberately byte-identical to the result the SDK produces for a tool that
    genuinely does not exist. A distinguishable refusal is an enumeration
    oracle: a tenant that can tell "forbidden" from "nonexistent" can map every
    other tenant's capabilities one call at a time, which defeats the point of
    filtering the listing.

    This returns a refusal rather than raising, because a raised error becomes a
    JSON-RPC error — a different response shape from a tool result, and
    therefore distinguishable on its own.
    """
    return {
        "content": [{"text": f"Unknown tool: {name}", "type": "text"}],
        "isError": True,
        "resultType": "complete",
    }


def build_tenancy_middleware(registry: TenantRegistry) -> Any:
    """Scopes both discovery and invocation to the authenticated tenant.

    Two enforcement points, because filtering a listing is not authorization:

    - `tools/list` and `resources/list` are filtered, so a tenant only
      *discovers* what it was granted.
    - `tools/call` is checked independently, because a caller can name a tool it
      never listed. A server that only filters the listing has published a UI
      convention, not a security boundary.
    """

    async def tenancy_middleware(ctx: Any, call_next: Any) -> Any:
        if ctx.method not in TENANT_SCOPED_METHODS:
            return await call_next(ctx)

        tenant = current_tenant(registry)
        if tenant is None:
            # The transport rejects unauthenticated requests before this point;
            # reaching here means the server was wired without a token verifier,
            # which should fail closed rather than serve unscoped data.
            raise PermissionError("no authenticated tenant for a tenant-scoped method")

        if ctx.method == "tools/call":
            name = (ctx.params or {}).get("name")
            if isinstance(name, str) and not tenant.grants_tool(name):
                return _unknown_tool_result(name)

        result = await call_next(ctx)

        if ctx.method == "tools/list":
            return _filter_listing(result, "tools", "name", tenant.grants_tool)
        if ctx.method == "resources/list":
            return _filter_listing(result, "resources", "uri", tenant.grants_resource)
        return result

    return tenancy_middleware
