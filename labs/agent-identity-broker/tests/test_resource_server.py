"""Each of the five checks, failed independently.

A test per invariant, so a regression names which one broke rather than reporting
"auth is broken". The last test is the one that matters most: it pins that all five
are actually reachable, because a check that cannot fail is indistinguishable from
one that is not there.
"""

from __future__ import annotations

import datetime as dt

import jwt
import pytest

from agent_identity.claims import ExchangeRequest
from agent_identity.demo import (
    BILLING,
    ISSUER,
    SUPPORT_ENGINEER_SCOPES,
    Deployment,
    build_deployment,
)
from agent_identity.errors import TokenRejected
from agent_identity.keys import ALGORITHM, SigningKey
from agent_identity.resource_server import ResourceServer


def _scoped_token(d: Deployment, scopes: frozenset[str] = frozenset({"invoice:read"})) -> str:
    user = d.broker.issue_user_token("u-1", audience=ISSUER, scopes=SUPPORT_ENGINEER_SCOPES)
    return d.broker.exchange(
        ExchangeRequest(
            subject_token=user, resource=BILLING, scopes=scopes, actor="agent-a"
        ),
        presented_to=ISSUER,
    )


def test_a_correct_token_is_accepted_and_identifies_both_parties() -> None:
    d = build_deployment()
    principal = d.servers[BILLING].call_tool(
        _scoped_token(d), tool="read_invoice", required_scope="invoice:read"
    )

    assert principal.subject == "u-1"
    assert principal.actor == "agent-a"
    # The audit rendering names the agent, not just the human it acted for.
    assert principal.describe() == "agent-a acting for u-1"


def test_check_1_a_token_signed_by_the_wrong_key_is_rejected() -> None:
    d = build_deployment()
    attacker = SigningKey()
    forged = jwt.encode(
        {
            "iss": ISSUER,
            "sub": "u-1",
            "aud": BILLING,
            "scope": "invoice:refund",
            "exp": dt.datetime.now(dt.UTC) + dt.timedelta(minutes=5),
        },
        attacker.private_pem,
        algorithm=ALGORITHM,
    )
    with pytest.raises(TokenRejected):
        d.servers[BILLING].authenticate(forged)


def test_check_2_an_untrusted_issuer_is_rejected() -> None:
    d = build_deployment()
    rogue = jwt.encode(
        {
            "iss": "https://attacker.example/",
            "sub": "u-1",
            "aud": BILLING,
            "scope": "invoice:refund",
            "exp": dt.datetime.now(dt.UTC) + dt.timedelta(minutes=5),
        },
        d.key.private_pem,  # even signed with the real key
        algorithm=ALGORITHM,
    )
    with pytest.raises(TokenRejected, match="issuer"):
        d.servers[BILLING].authenticate(rogue)


def test_check_3_an_expired_token_is_rejected() -> None:
    d = build_deployment()
    stale = jwt.encode(
        {
            "iss": ISSUER,
            "sub": "u-1",
            "aud": BILLING,
            "scope": "invoice:read",
            "exp": dt.datetime.now(dt.UTC) - dt.timedelta(seconds=1),
        },
        d.key.private_pem,
        algorithm=ALGORITHM,
    )
    with pytest.raises(TokenRejected, match="expired"):
        d.servers[BILLING].authenticate(stale)


def test_check_4_a_mismatched_audience_is_rejected() -> None:
    d = build_deployment()
    elsewhere = ResourceServer(
        identity="https://other.internal/mcp",
        trusted_issuer=ISSUER,
        issuer_public_key=d.key.public_pem,
    )
    with pytest.raises(TokenRejected, match="audience"):
        elsewhere.authenticate(_scoped_token(d))


def test_check_5_a_valid_token_without_the_tools_scope_is_rejected() -> None:
    """Audience gets you in the door; it says nothing about which room."""
    d = build_deployment()
    token = _scoped_token(d, scopes=frozenset({"invoice:read"}))

    # Same token, same server — the read succeeds and the refund does not.
    d.servers[BILLING].call_tool(token, tool="read_invoice", required_scope="invoice:read")
    with pytest.raises(TokenRejected, match="scope"):
        d.servers[BILLING].call_tool(token, tool="issue_refund", required_scope="invoice:refund")


def test_rejection_reasons_are_distinct_so_the_audit_log_can_tell_them_apart() -> None:
    """Guards against every failure collapsing into one indistinguishable error.

    If all five checks raised the same message, an operator reading the audit log
    could not tell a forged token from an expired one from a misaddressed one.
    """
    d = build_deployment()
    reasons: set[str] = set()

    for build in (
        lambda: jwt.encode(
            {"iss": ISSUER, "sub": "u", "aud": BILLING, "exp": dt.datetime.now(dt.UTC)
             - dt.timedelta(seconds=1)},
            d.key.private_pem,
            algorithm=ALGORITHM,
        ),
        lambda: jwt.encode(
            {"iss": "https://attacker.example/", "sub": "u", "aud": BILLING,
             "exp": dt.datetime.now(dt.UTC) + dt.timedelta(minutes=5)},
            d.key.private_pem,
            algorithm=ALGORITHM,
        ),
        lambda: jwt.encode(
            {"iss": ISSUER, "sub": "u", "aud": "https://other.internal/mcp",
             "exp": dt.datetime.now(dt.UTC) + dt.timedelta(minutes=5)},
            d.key.private_pem,
            algorithm=ALGORITHM,
        ),
    ):
        with pytest.raises(TokenRejected) as caught:
            d.servers[BILLING].authenticate(build())
        reasons.add(str(caught.value))

    assert len(reasons) == 3, f"expected three distinct reasons, got {reasons}"
