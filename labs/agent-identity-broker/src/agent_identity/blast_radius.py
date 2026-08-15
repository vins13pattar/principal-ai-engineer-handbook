"""Measures what a stolen token can actually do, under each delegation strategy.

The module's central claim is comparative — agent-scoped credentials *bound* an
agent's blast radius where a forwarded user token does not. A claim like that is
worth only as much as its measurement, so this walks a stolen credential against
every (server, tool) pair in a fleet and counts what it opens.

`tests/test_blast_radius.py` asserts on the numbers this returns.
"""

from __future__ import annotations

from dataclasses import dataclass

from agent_identity.errors import TokenRejected
from agent_identity.resource_server import ResourceServer


@dataclass(frozen=True)
class Tool:
    name: str
    required_scope: str


@dataclass(frozen=True)
class BlastRadius:
    """What one stolen token opened, out of everything it was tried against.

    `reachable` holds (server, tool) pairs rather than pre-joined strings: server
    identities are URIs, so any single-character separator a caller might split on
    already appears inside them.
    """

    reachable: tuple[tuple[str, str], ...]
    attempted: int

    @property
    def count(self) -> int:
        return len(self.reachable)

    @property
    def servers(self) -> frozenset[str]:
        return frozenset(server for server, _ in self.reachable)

    @property
    def tools(self) -> frozenset[str]:
        return frozenset(tool for _, tool in self.reachable)


def measure(
    token: str,
    fleet: dict[ResourceServer, tuple[Tool, ...]],
) -> BlastRadius:
    """Try one token against every tool on every server; report what it opens.

    No exception escapes: a rejection is the measurement, not an error.
    """
    reachable: list[tuple[str, str]] = []
    attempted = 0
    for server, tools in fleet.items():
        for tool in tools:
            attempted += 1
            try:
                server.call_tool(token, tool=tool.name, required_scope=tool.required_scope)
            except TokenRejected:
                continue
            reachable.append((server.identity, tool.name))
    return BlastRadius(reachable=tuple(reachable), attempted=attempted)
