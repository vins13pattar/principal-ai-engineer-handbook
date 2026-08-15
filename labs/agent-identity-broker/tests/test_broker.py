"""What the exchange must guarantee about the token it hands back."""

from __future__ import annotations

import datetime as dt
from typing import Any

import jwt
import pytest

from agent_identity.broker import GRANT_TYPE, TokenBroker
from agent_identity.claims import ExchangeRequest
from agent_identity.demo import (
    BILLING,
    CRM,
    ISSUER,
    SUPPORT_ENGINEER_SCOPES,
    Deployment,
    build_deployment,
)
from agent_identity.errors import ExchangeDenied
from agent_identity.keys import ALGORITHM


def _decode(d: Deployment, token: str, audience: str) -> dict[str, Any]:
    return jwt.decode(
        token, key=d.key.public_pem, algorithms=[ALGORITHM], audience=audience, issuer=ISSUER
    )


def test_the_grant_type_is_the_rfc_8693_uri() -> None:
    """Pinned so the wire value cannot drift into something invented."""
    assert GRANT_TYPE == "urn:ietf:params:oauth:grant-type:token-exchange"


def test_exchange_narrows_audience_scope_and_lifetime_together() -> None:
    d = build_deployment()
    user = d.broker.issue_user_token(
        "u-1", audience=ISSUER, scopes=SUPPORT_ENGINEER_SCOPES, lifetime=dt.timedelta(hours=8)
    )
    scoped = d.broker.exchange(
        ExchangeRequest(
            subject_token=user, resource=BILLING, scopes=frozenset({"invoice:read"}), actor="a-1"
        ),
        presented_to=ISSUER,
    )

    before = _decode(d, user, ISSUER)
    after = _decode(d, scoped, BILLING)

    assert after["aud"] == BILLING and before["aud"] == ISSUER
    assert after["scope"] == "invoice:read"
    assert len(before["scope"].split()) == 5
    # All three narrowings, not just the one that is easiest to demonstrate.
    assert after["exp"] - after["iat"] < before["exp"] - before["iat"]


def test_the_act_claim_records_the_agent_that_will_act() -> None:
    """RFC 8693 s4.1 — delegation occurred, and this is who is acting."""
    d = build_deployment()
    user = d.broker.issue_user_token("u-1", audience=ISSUER, scopes=SUPPORT_ENGINEER_SCOPES)
    scoped = d.broker.exchange(
        ExchangeRequest(
            subject_token=user, resource=CRM, scopes=frozenset({"contact:read"}), actor="agent-crm"
        ),
        presented_to=ISSUER,
    )

    claims = _decode(d, scoped, CRM)
    assert claims["sub"] == "u-1", "the user is still the subject"
    assert claims["act"] == {"sub": "agent-crm"}, "the agent is the actor"


def test_may_act_restricts_which_agents_can_act_for_a_user() -> None:
    d = build_deployment()
    user = d.broker.issue_user_token(
        "u-1",
        audience=ISSUER,
        scopes=SUPPORT_ENGINEER_SCOPES,
        may_act=frozenset({"agent-approved"}),
    )

    d.broker.exchange(
        ExchangeRequest(
            subject_token=user,
            resource=BILLING,
            scopes=frozenset({"invoice:read"}),
            actor="agent-approved",
        ),
        presented_to=ISSUER,
    )

    with pytest.raises(ExchangeDenied, match="may_act"):
        d.broker.exchange(
            ExchangeRequest(
                subject_token=user,
                resource=BILLING,
                scopes=frozenset({"invoice:read"}),
                actor="agent-unlisted",
            ),
            presented_to=ISSUER,
        )


def test_a_token_addressed_elsewhere_cannot_be_laundered_through_the_broker() -> None:
    """A stolen token for another audience must not become a fresh, valid one.

    Without this check the broker is an escalation service: present anything, receive
    a correctly-minted credential for a target of your choosing.
    """
    d = build_deployment()
    for_billing = d.broker.issue_user_token(
        "u-1", audience=BILLING, scopes=SUPPORT_ENGINEER_SCOPES
    )

    with pytest.raises(ExchangeDenied, match="subject token invalid"):
        d.broker.exchange(
            ExchangeRequest(
                subject_token=for_billing,
                resource=CRM,
                scopes=frozenset({"contact:read"}),
                actor="agent-a",
            ),
            presented_to=ISSUER,
        )


def test_an_expired_subject_token_cannot_be_exchanged() -> None:
    d = build_deployment()
    stale = d.broker.issue_user_token(
        "u-1",
        audience=ISSUER,
        scopes=SUPPORT_ENGINEER_SCOPES,
        lifetime=dt.timedelta(seconds=-1),
    )

    with pytest.raises(ExchangeDenied, match="subject token invalid"):
        d.broker.exchange(
            ExchangeRequest(
                subject_token=stale,
                resource=BILLING,
                scopes=frozenset({"invoice:read"}),
                actor="agent-a",
            ),
            presented_to=ISSUER,
        )


def test_issued_agent_tokens_are_short_lived_by_configuration() -> None:
    """The compensating control for a credential in model-directed control flow."""
    d = build_deployment()
    broker = TokenBroker(d.key, issuer=ISSUER, token_lifetime=dt.timedelta(minutes=5))
    user = broker.issue_user_token("u-1", audience=ISSUER, scopes=frozenset({"invoice:read"}))
    scoped = broker.exchange(
        ExchangeRequest(
            subject_token=user, resource=BILLING, scopes=frozenset({"invoice:read"}), actor="a"
        ),
        presented_to=ISSUER,
    )

    claims = _decode(d, scoped, BILLING)
    assert claims["exp"] - claims["iat"] == 300
