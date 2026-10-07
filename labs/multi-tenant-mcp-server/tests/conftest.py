from __future__ import annotations

import json
from collections.abc import AsyncIterator, Awaitable, Callable, MutableMapping
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import httpx2
import pytest
from mcp import Client
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


Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]


@dataclass(frozen=True)
class WireRequest:
    """One JSON-RPC request as the server received it."""

    method: str | None
    meta_keys: frozenset[str]
    authorization: str | None
    protocol_version: str | None


class WireRecorder:
    """ASGI middleware that records every JSON-RPC request reaching the server.

    The point of recording rather than inferring: the property this lab rests on
    is about requests the SDK sends that application code never sees, so the
    only honest evidence is what actually arrived.
    """

    def __init__(self) -> None:
        self.requests: list[WireRequest] = []

    def wrap(self, app: ASGIApp) -> ASGIApp:
        async def recorded(scope: Scope, receive: Receive, send: Send) -> None:
            if scope["type"] != "http" or scope["method"] != "POST":
                await app(scope, receive, send)
                return
            chunks: list[bytes] = []
            more = True
            while more:
                message = await receive()
                chunks.append(message.get("body", b""))
                more = message.get("more_body", False)
            body = b"".join(chunks)
            self._record(scope, body)

            replayed = False

            async def replay() -> Message:
                nonlocal replayed
                if not replayed:
                    replayed = True
                    return {"type": "http.request", "body": body, "more_body": False}
                return await receive()

            await app(scope, replay, send)

        return recorded

    def _record(self, scope: Scope, body: bytes) -> None:
        try:
            document = json.loads(body)
        except ValueError:
            return
        headers = {k.decode().lower(): v.decode() for k, v in scope["headers"]}
        for message in document if isinstance(document, list) else [document]:
            params = message.get("params") or {}
            self.requests.append(
                WireRequest(
                    method=message.get("method"),
                    meta_keys=frozenset((params.get("_meta") or {}).keys()),
                    authorization=headers.get("authorization"),
                    protocol_version=headers.get("mcp-protocol-version"),
                )
            )


@asynccontextmanager
async def connect(
    server: MCPServer, token: str | None, *, recorder: WireRecorder | None = None
) -> AsyncIterator[Client]:
    """Connects the SDK's own `Client`, carrying `token` as a bearer credential.

    `Client`, not the low-level `ClientSession`: `ClientSession.initialize()`
    performs the legacy handshake and negotiates 2025-11-25, so tests driven
    through it never exercise the 2026-07-28 protocol this lab is about. A
    regression test for that is in test_protocol_and_auth.py.
    """
    app: ASGIApp = build_asgi_app(server, transport_security=_NO_DNS_REBINDING_CHECK)
    if recorder is not None:
        app = recorder.wrap(app)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with server.session_manager.run():
        transport = httpx2.ASGITransport(app=app)
        async with httpx2.AsyncClient(
            transport=transport, base_url="http://mcp.test", headers=headers
        ) as http_client:
            async with Client(
                streamable_http_client("http://mcp.test/mcp", http_client=http_client)
            ) as client:
                yield client
