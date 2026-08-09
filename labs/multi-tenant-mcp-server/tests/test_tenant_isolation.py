from __future__ import annotations

import pytest
from conftest import connect
from mcp.server import MCPServer

from mcp_tenancy.demo import ACME_TOKEN, GLOBEX_TOKEN


@pytest.mark.asyncio
async def test_each_tenant_discovers_only_its_own_tools(server: MCPServer) -> None:
    async with connect(server, ACME_TOKEN) as acme:
        acme_tools = {t.name for t in (await acme.list_tools()).tools}
    async with connect(server, GLOBEX_TOKEN) as globex:
        globex_tools = {t.name for t in (await globex.list_tools()).tools}

    assert acme_tools == {"whoami", "search_docs", "issue_refund"}
    assert globex_tools == {"whoami", "search_docs"}


@pytest.mark.asyncio
async def test_a_tool_call_runs_as_the_calling_tenant(server: MCPServer) -> None:
    async with connect(server, ACME_TOKEN) as acme:
        acme_result = await acme.call_tool("whoami", {})
    async with connect(server, GLOBEX_TOKEN) as globex:
        globex_result = await globex.call_tool("whoami", {})

    assert acme_result.content[0].text == "acme"  # type: ignore[union-attr]
    assert globex_result.content[0].text == "globex"  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_calling_an_ungranted_tool_is_refused_even_though_it_exists(
    server: MCPServer,
) -> None:
    # The decisive case. issue_refund is registered on the server and callable
    # by acme, so filtering the listing alone would not have stopped globex —
    # a caller can always name a tool it never listed.
    async with connect(server, GLOBEX_TOKEN) as globex:
        result = await globex.call_tool(
            "issue_refund", {"order_id": "42", "amount_cents": 500}
        )

    assert result.is_error


@pytest.mark.asyncio
async def test_the_same_tool_succeeds_for_the_tenant_that_was_granted_it(
    server: MCPServer,
) -> None:
    async with connect(server, ACME_TOKEN) as acme:
        result = await acme.call_tool("issue_refund", {"order_id": "42", "amount_cents": 500})

    assert not result.is_error
    assert "refunded 500c" in result.content[0].text  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_a_refusal_does_not_reveal_that_the_tool_exists(server: MCPServer) -> None:
    # A tenant probing for another tenant's capabilities must not be able to
    # tell "exists but forbidden" from "does not exist" by the error text.
    async with connect(server, GLOBEX_TOKEN) as globex:
        forbidden = await globex.call_tool("issue_refund", {"order_id": "1", "amount_cents": 1})
        nonexistent = await globex.call_tool("no_such_tool", {})

    forbidden_text = str(forbidden.content[0].text)  # type: ignore[union-attr]
    nonexistent_text = str(nonexistent.content[0].text)  # type: ignore[union-attr]
    assert forbidden.is_error and nonexistent.is_error
    assert forbidden_text.replace("issue_refund", "X") == nonexistent_text.replace(
        "no_such_tool", "X"
    )
