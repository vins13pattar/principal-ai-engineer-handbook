from __future__ import annotations

import httpx2
import pytest
from conftest import _NO_DNS_REBINDING_CHECK, connect
from mcp.server import MCPServer
from mcp.server.runner import LATEST_MODERN_VERSION, MODERN_PROTOCOL_VERSIONS

from mcp_tenancy.app import build_asgi_app
from mcp_tenancy.demo import ACME_TOKEN, GLOBEX_TOKEN
from mcp_tenancy.server import TENANT_SCOPED_CACHE_HINTS


def test_the_sdk_targets_the_2026_07_28_protocol() -> None:
    # Pins the assumption the whole lab rests on. If a future SDK adds another
    # modern version, this fails and the lab's claims get re-checked rather than
    # silently becoming stale.
    assert LATEST_MODERN_VERSION == "2026-07-28"
    assert MODERN_PROTOCOL_VERSIONS == ("2026-07-28",)


def test_tenant_scoped_listings_are_never_advertised_as_shareable() -> None:
    """`cacheScope: public` on a tenant-filtered listing is a cross-tenant leak.

    It tells every cache on the path — client, gateway, CDN — that one tenant's
    filtered response may be served to another. Asserted rather than left to
    review, because it is a one-word change with no local symptom.
    """
    for method, hint in TENANT_SCOPED_CACHE_HINTS.items():
        assert hint.scope == "private", f"{method} must not be advertised as shareable"
        assert hint.ttl_ms > 0, f"{method} should still be cacheable per-caller"


@pytest.mark.asyncio
async def test_an_unauthenticated_request_is_rejected_by_the_transport(
    server: MCPServer,
) -> None:
    # The credential is checked before any handler runs, which is what makes
    # this cover the SDK's own internal calls as well as application ones.
    app = build_asgi_app(server, transport_security=_NO_DNS_REBINDING_CHECK)
    async with server.session_manager.run():
        transport = httpx2.ASGITransport(app=app)
        async with httpx2.AsyncClient(transport=transport, base_url="http://mcp.test") as http:
            response = await http.post(
                "/mcp",
                json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    "Mcp-Method": "tools/list",
                },
            )

    assert response.status_code == 401
    assert "invalid_token" in response.text


@pytest.mark.asyncio
async def test_an_invalid_bearer_token_is_rejected(server: MCPServer) -> None:
    app = build_asgi_app(server, transport_security=_NO_DNS_REBINDING_CHECK)
    async with server.session_manager.run():
        transport = httpx2.ASGITransport(app=app)
        async with httpx2.AsyncClient(
            transport=transport,
            base_url="http://mcp.test",
            headers={"Authorization": "Bearer tok-not-real"},
        ) as http:
            response = await http.post(
                "/mcp",
                json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    "Mcp-Method": "tools/list",
                },
            )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_the_credential_covers_the_sdks_own_internal_calls(server: MCPServer) -> None:
    """The reason this lab authenticates on the transport rather than in `_meta`.

    `call_tool()` internally invokes `validate_tool_result()`, which issues its
    own `tools/list` to check the output schema. That call carries no
    application metadata, so a server authorizing on per-request `_meta` refuses
    its own client here. On the `Authorization` header it simply works — which
    is the property this asserts.
    """
    async with connect(server, ACME_TOKEN) as acme:
        result = await acme.call_tool("search_docs", {"query": "retention"})

    assert not result.is_error
    assert "[acme]" in result.content[0].text  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_independent_connections_share_no_tenant_state(server: MCPServer) -> None:
    """Statelessness: nothing about one caller survives into another's request.

    Both connections target the same server object, back to back. If any tenant
    identity were cached per server rather than resolved per request, the second
    would see the first's grants.
    """
    async with connect(server, ACME_TOKEN) as acme:
        first = await acme.call_tool("whoami", {})
    async with connect(server, GLOBEX_TOKEN) as globex:
        second = await globex.call_tool("whoami", {})
    async with connect(server, ACME_TOKEN) as acme_again:
        third = await acme_again.call_tool("whoami", {})

    assert first.content[0].text == "acme"  # type: ignore[union-attr]
    assert second.content[0].text == "globex"  # type: ignore[union-attr]
    assert third.content[0].text == "acme"  # type: ignore[union-attr]
