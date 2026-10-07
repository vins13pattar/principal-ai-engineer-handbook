from __future__ import annotations

from typing import cast

import httpx2
import pytest
from conftest import _NO_DNS_REBINDING_CHECK, WireRecorder, connect
from mcp.server import MCPServer
from mcp_types import RequestParamsMeta
from mcp_types.version import LATEST_MODERN_VERSION, MODERN_PROTOCOL_VERSIONS

from mcp_tenancy.app import build_asgi_app
from mcp_tenancy.demo import ACME_TOKEN, ACME_TOKEN_FOR_ANOTHER_SERVER, GLOBEX_TOKEN
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
async def test_a_token_issued_for_another_server_is_refused(server: MCPServer) -> None:
    """A real tenant's real token, minted for a different resource (RFC 8707).

    The token names acme and would resolve to acme's grants. Only the resource
    check refuses it -- the property `validate_token_resource=True` buys, and
    the one mcp 2.x leaves off unless asked.
    """
    app = build_asgi_app(server, transport_security=_NO_DNS_REBINDING_CHECK)
    async with server.session_manager.run():
        transport = httpx2.ASGITransport(app=app)
        async with httpx2.AsyncClient(
            transport=transport,
            base_url="http://mcp.test",
            headers={"Authorization": f"Bearer {ACME_TOKEN_FOR_ANOTHER_SERVER}"},
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
async def test_the_harness_speaks_2026_07_28_on_the_wire(server: MCPServer) -> None:
    """Guards the guard: every other test is only as good as the protocol it runs.

    The low-level `ClientSession.initialize()` negotiates 2025-11-25, and this
    suite once ran entirely on it -- green, and never touching the protocol the
    lab is about.
    """
    recorder = WireRecorder()
    async with connect(server, ACME_TOKEN, recorder=recorder) as acme:
        await acme.list_tools()

    methods = [r.method for r in recorder.requests]
    assert methods[0] == "server/discover"
    assert "initialize" not in methods
    assert {r.protocol_version for r in recorder.requests} == {"2026-07-28"}


@pytest.mark.asyncio
async def test_the_credential_covers_the_sdks_own_internal_calls(server: MCPServer) -> None:
    """The reason this lab authenticates on the transport rather than in `_meta`.

    Calling a tool the client has not listed yet makes `call_tool()` run
    `validate_tool_result()`, which issues its own `tools/list` to fetch the
    output schema. The SDK sends that request itself: it carries the protocol
    `_meta` stamp, but none of the caller's. So a server authorizing on a
    credential in `_meta` refuses its own client here. Asserted on the wire,
    not inferred from the call succeeding.
    """
    recorder = WireRecorder()
    # An application key the SDK's TypedDict does not declare -- which is the
    # point: it stands for whatever a caller might put there.
    app_meta = cast(RequestParamsMeta, {"app.example/tenant": "acme"})
    async with connect(server, ACME_TOKEN, recorder=recorder) as acme:
        result = await acme.call_tool("search_docs", {"query": "retention"}, meta=app_meta)

    assert not result.is_error
    assert "[acme]" in result.content[0].text  # type: ignore[union-attr]

    call = next(r for r in recorder.requests if r.method == "tools/call")
    hidden = next(r for r in recorder.requests if r.method == "tools/list")
    assert "app.example/tenant" in call.meta_keys
    assert "app.example/tenant" not in hidden.meta_keys
    assert "io.modelcontextprotocol/protocolVersion" in hidden.meta_keys
    assert hidden.authorization == f"Bearer {ACME_TOKEN}"


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
