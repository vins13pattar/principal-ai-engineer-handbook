"""Measures the module's comparative claim instead of restating it.

Claim: an agent-scoped credential bounds blast radius where a forwarded user token
does not. Measured as "how many of the fleet's tools does one stolen token open?"
"""

from __future__ import annotations

import pytest

from agent_identity.blast_radius import measure
from agent_identity.claims import ExchangeRequest
from agent_identity.demo import BILLING, CRM, ISSUER, SUPPORT_ENGINEER_SCOPES, build_deployment
from agent_identity.errors import ExchangeDenied


def test_agent_scoped_token_opens_exactly_one_tool() -> None:
    """Narrowed to one audience and one scope, a stolen token is worth one tool."""
    d = build_deployment()
    user = d.broker.issue_user_token("u-1", audience=ISSUER, scopes=SUPPORT_ENGINEER_SCOPES)
    scoped = d.broker.exchange(
        ExchangeRequest(
            subject_token=user,
            resource=BILLING,
            scopes=frozenset({"invoice:read"}),
            actor="agent-support",
        ),
        presented_to=ISSUER,
    )

    radius = measure(scoped, d.fleet())

    assert radius.attempted == 6
    assert radius.reachable == ((BILLING, "read_invoice"),)
    # The refund tool sits on the *same server* and stays shut, because audience
    # alone was never the whole control — scope is the second half.
    assert "issue_refund" not in radius.tools


def test_a_token_scoped_to_one_server_cannot_reach_another() -> None:
    d = build_deployment()
    user = d.broker.issue_user_token("u-1", audience=ISSUER, scopes=SUPPORT_ENGINEER_SCOPES)
    billing_token = d.broker.exchange(
        ExchangeRequest(
            subject_token=user,
            resource=BILLING,
            scopes=frozenset({"invoice:read"}),
            actor="agent-a",
        ),
        presented_to=ISSUER,
    )

    radius = measure(billing_token, d.fleet())

    assert radius.servers == {BILLING}
    assert CRM not in radius.servers


def test_the_user_token_itself_opens_nothing_in_the_fleet() -> None:
    """Passthrough fails loudly rather than over-granting.

    This is the number that makes the comparison honest: the broad credential is not
    "more powerful against the fleet", it is *unusable* against it, because no server
    accepts a token addressed to the identity provider. The danger of passthrough is
    what it hands to whoever receives it, not what it opens directly.
    """
    d = build_deployment()
    user = d.broker.issue_user_token("u-1", audience=ISSUER, scopes=SUPPORT_ENGINEER_SCOPES)

    radius = measure(user, d.fleet())

    assert radius.count == 0
    assert radius.attempted == 6


def test_a_token_scoped_as_broadly_as_the_user_opens_everything_it_can() -> None:
    """The counterfactual: narrowing the audience but not the scope.

    Bound to one server but carrying every scope the user has, the token opens both
    of that server's tools — including the refund. Audience limits *where*; only
    scope limits *what*. A system that does one and not the other has done half.
    """
    d = build_deployment()
    user = d.broker.issue_user_token("u-1", audience=ISSUER, scopes=SUPPORT_ENGINEER_SCOPES)
    unnarrowed = d.broker.exchange(
        ExchangeRequest(
            subject_token=user,
            resource=BILLING,
            scopes=SUPPORT_ENGINEER_SCOPES,
            actor="agent-a",
        ),
        presented_to=ISSUER,
    )

    radius = measure(unnarrowed, d.fleet())

    assert radius.servers == {BILLING}
    assert radius.tools == {"read_invoice", "issue_refund"}


def test_widening_scope_at_exchange_time_is_refused() -> None:
    """A narrowing mechanism that can widen is not a control."""
    d = build_deployment()
    limited = d.broker.issue_user_token(
        "u-2", audience=ISSUER, scopes=frozenset({"invoice:read"})
    )

    with pytest.raises(ExchangeDenied, match="cannot widen scope"):
        d.broker.exchange(
            ExchangeRequest(
                subject_token=limited,
                resource=BILLING,
                scopes=frozenset({"invoice:read", "invoice:refund"}),
                actor="agent-a",
            ),
            presented_to=ISSUER,
        )
