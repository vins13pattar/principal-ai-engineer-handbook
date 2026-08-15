"""Agent identity as running code: token exchange, and the checks a resource server owes.

The lab exists to make one claim testable — that a short-lived, audience-bound,
scope-narrowed credential bounds an agent's blast radius in a way a forwarded user
token does not. `tests/test_blast_radius.py` is where that claim is measured rather
than asserted.
"""

from agent_identity.broker import TokenBroker
from agent_identity.claims import AgentPrincipal, ExchangeRequest
from agent_identity.errors import ExchangeDenied, TokenRejected
from agent_identity.resource_server import ResourceServer

__all__ = [
    "AgentPrincipal",
    "ExchangeDenied",
    "ExchangeRequest",
    "ResourceServer",
    "TokenBroker",
    "TokenRejected",
]
