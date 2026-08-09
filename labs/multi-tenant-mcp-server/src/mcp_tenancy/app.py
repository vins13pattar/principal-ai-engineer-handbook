from __future__ import annotations

from typing import Any

from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

from .demo import build_demo_server


def build_asgi_app(
    server: MCPServer | None = None,
    *,
    transport_security: TransportSecuritySettings | None = None,
) -> Any:
    """Builds the Streamable HTTP app.

    `stateless_http=True` is the 2026-07-28 posture: no session is created, so
    any replica can serve any request and a load balancer needs no affinity.
    That is only safe because tenant identity is re-established from the
    `Authorization` header on every request rather than remembered per session.
    """
    mcp_server = server or build_demo_server()
    return mcp_server.streamable_http_app(
        stateless_http=True,
        json_response=True,
        transport_security=transport_security,
    )


def main() -> None:  # pragma: no cover - convenience entry point
    """Serve the demo server on localhost for manual exploration."""
    import uvicorn

    uvicorn.run(build_asgi_app(), host="127.0.0.1", port=8000)


if __name__ == "__main__":  # pragma: no cover
    main()
