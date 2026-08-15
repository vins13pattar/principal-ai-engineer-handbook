"""The narrowing half: RFC 8693 token exchange.

Takes a broad user token and returns one bound to a single audience, a subset of the
original scopes, a named acting agent, and a lifetime measured in minutes.
"""

from __future__ import annotations

import datetime as dt

import jwt

from agent_identity.claims import ExchangeRequest
from agent_identity.errors import ExchangeDenied
from agent_identity.keys import ALGORITHM, SigningKey

#: RFC 8693 grant type, recorded here so the wire value is greppable from the code.
GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange"


class TokenBroker:
    """A simulated authorization server that mints agent-scoped tokens.

    The three narrowings are enforced here rather than trusted from the caller,
    because a broker that mints whatever it is asked for is a broker that adds a
    round trip and no security.
    """

    def __init__(
        self,
        key: SigningKey,
        *,
        issuer: str,
        token_lifetime: dt.timedelta = dt.timedelta(minutes=5),
    ) -> None:
        self._key = key
        self._issuer = issuer
        self._lifetime = token_lifetime

    def issue_user_token(
        self,
        subject: str,
        *,
        audience: str,
        scopes: frozenset[str],
        may_act: frozenset[str] | None = None,
        lifetime: dt.timedelta = dt.timedelta(hours=8),
    ) -> str:
        """The broad, session-length credential a user gets after signing in.

        This is the token the module argues should NOT be forwarded to downstream
        servers. `may_act` names the agents permitted to act for this user — a
        constraint checked at exchange time, not at use time.
        """
        now = dt.datetime.now(dt.UTC)
        payload: dict[str, object] = {
            "iss": self._issuer,
            "sub": subject,
            "aud": audience,
            "scope": " ".join(sorted(scopes)),
            "iat": now,
            "exp": now + lifetime,
        }
        if may_act is not None:
            payload["may_act"] = {"sub": sorted(may_act)}
        return jwt.encode(payload, self._key.private_pem, algorithm=ALGORITHM)

    def exchange(self, request: ExchangeRequest, *, presented_to: str) -> str:
        """Narrow a subject token into an agent-scoped one.

        `presented_to` is the audience the subject token was issued for — the broker
        verifies the caller actually holds a token addressed to it before agreeing to
        exchange, so a stolen token for some other service cannot be laundered here.
        """
        try:
            subject_claims = jwt.decode(
                request.subject_token,
                key=self._key.public_pem,
                algorithms=[ALGORITHM],
                audience=presented_to,
                issuer=self._issuer,
                options={"require": ["exp", "aud", "iss", "sub"]},
            )
        except jwt.PyJWTError as error:
            raise ExchangeDenied(f"subject token invalid: {type(error).__name__}") from error

        held = frozenset(str(subject_claims.get("scope", "")).split())
        widened = request.scopes - held
        if widened:
            # The whole point of the exchange is narrowing. A request for scopes the
            # subject never had is either a bug or an escalation attempt; both are denied.
            raise ExchangeDenied(f"cannot widen scope; subject does not hold {sorted(widened)}")

        permitted = subject_claims.get("may_act")
        if permitted is not None and request.actor not in set(permitted.get("sub", [])):
            raise ExchangeDenied(f"actor {request.actor!r} is not in the subject's may_act")

        now = dt.datetime.now(dt.UTC)
        return jwt.encode(
            {
                "iss": self._issuer,
                "sub": subject_claims["sub"],
                # RFC 8707: the requested resource becomes the audience. This single
                # line is what makes the resource server's audience check meaningful.
                "aud": request.resource,
                "scope": " ".join(sorted(request.scopes)),
                # RFC 8693 s4.1: delegation occurred, and this is who is acting.
                "act": {"sub": request.actor},
                "iat": now,
                "exp": now + self._lifetime,
            },
            self._key.private_pem,
            algorithm=ALGORITHM,
        )
