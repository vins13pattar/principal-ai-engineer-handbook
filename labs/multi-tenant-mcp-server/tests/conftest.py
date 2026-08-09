from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx2
import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

from mcp_tenancy.app import build_asgi_app
from mcp_tenancy.demo import build_demo_server

# The whole point of this lab is that credentials ride on the transport, so the
# tests drive the real Streamable HTTP app over an in-process ASGI transport
# rather than connecting to the server object directly. Anything that only works
# in-process would not prove the property being claimed.
_NO_DNS_REBINDING_CHECK = TransportSecuritySettings(enable_dns_rebinding_protection=False)


@pytest.fixture
def server() -> MCPServer:
    return build_demo_server()


@asynccontextmanager
async def connect(server: MCPServer, token: str | None) -> AsyncIterator[ClientSession]:
    """Opens a session carrying `token` as a bearer credential, or none at all."""
    app = build_asgi_app(server, transport_security=_NO_DNS_REBINDING_CHECK)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with server.session_manager.run():
        transport = httpx2.ASGITransport(app=app)
        async with httpx2.AsyncClient(
            transport=transport, base_url="http://mcp.test", headers=headers
        ) as http_client:
            async with streamable_http_client(
                "http://mcp.test/mcp", http_client=http_client
            ) as streams:
                async with ClientSession(streams[0], streams[1]) as session:
                    await session.initialize()
                    yield session
