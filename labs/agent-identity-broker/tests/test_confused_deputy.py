"""The test the whole lab exists for.

A token can be genuine in every respect — correctly signed by a trusted issuer,
unexpired, carrying real scopes — and still must be refused, because it was not
addressed to this server. That is the confused deputy, and it is the check most
likely to be missing, because nothing about a system without it looks broken.
"""

from __future__ import annotations

import datetime as dt

import jwt
import pytest

from agent_identity.claims import ExchangeRequest
from agent_identity.demo import (
    ADMIN,
    BILLING,
    CRM,
    ISSUER,
    SUPPORT_ENGINEER_SCOPES,
    build_deployment,
)
from agent_identity.errors import TokenRejected
from agent_identity.keys import ALGORITHM


def test_a_token_minted_for_another_server_is_rejected() -> None:
    """Signed, unexpired, real scopes, wrong audience — refused."""
    d = build_deployment()
    user = d.broker.issue_user_token("u-1", audience=ISSUER, scopes=SUPPORT_ENGINEER_SCOPES)

    # A perfectly legitimate token, for CRM.
    for_crm = d.broker.exchange(
        ExchangeRequest(
            subject_token=user, resource=CRM, scopes=frozenset({"contact:read"}), actor="agent-a"
        ),
        presented_to=ISSUER,
    )

    # It works where it was addressed.
    d.servers[CRM].call_tool(for_crm, tool="read_contact", required_scope="contact:read")

    # And is refused everywhere else, even though nothing about it is forged.
    with pytest.raises(TokenRejected, match="audience"):
        d.servers[BILLING].call_tool(for_crm, tool="read_invoice", required_scope="invoice:read")


def test_the_rejected_token_is_otherwise_completely_valid() -> None:
    """Guards against the test above passing for the wrong reason.

    If the token were expired or badly signed, the audience assertion would pass
    while proving nothing. This pins that the *only* thing wrong with it is `aud`.
    """
    d = build_deployment()
    user = d.broker.issue_user_token("u-1", audience=ISSUER, scopes=SUPPORT_ENGINEER_SCOPES)
    for_crm = d.broker.exchange(
        ExchangeRequest(
            subject_token=user, resource=CRM, scopes=frozenset({"contact:read"}), actor="agent-a"
        ),
        presented_to=ISSUER,
    )

    # Decoding with audience verification off must succeed: signature, issuer and
    # expiry are all sound.
    claims = jwt.decode(
        for_crm,
        key=d.key.public_pem,
        algorithms=[ALGORITHM],
        options={"verify_aud": False},
    )
    assert claims["iss"] == ISSUER
    assert claims["aud"] == CRM
    assert dt.datetime.fromtimestamp(claims["exp"], dt.UTC) > dt.datetime.now(dt.UTC)


def test_passthrough_of_the_raw_user_token_is_rejected_by_every_server() -> None:
    """Forwarding the user's own token is the failure mode the spec forbids.

    Its audience is the identity provider, not any MCP server, so no server in the
    fleet will take it — which is the behaviour that makes passthrough fail loudly
    instead of silently over-granting.
    """
    d = build_deployment()
    user = d.broker.issue_user_token("u-1", audience=ISSUER, scopes=SUPPORT_ENGINEER_SCOPES)

    for uri in (BILLING, CRM, ADMIN):
        with pytest.raises(TokenRejected, match="audience"):
            d.servers[uri].call_tool(user, tool="read_invoice", required_scope="invoice:read")
