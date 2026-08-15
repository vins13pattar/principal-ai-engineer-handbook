"""The enforcement half: what a resource server owes on every request.

Five checks, in this order, each failing independently so the audit log says which
invariant broke:

1. Signature verifies against the issuer's public key.
2. Issuer is one this server trusts.
3. Token has not expired.
4. `aud` names *this* server.
5. `scope` covers the specific tool being invoked.

Checks 1-4 are delegated to PyJWT rather than performed by hand after decoding.
That is deliberate: a `jwt.decode(..., options={"verify_aud": False})` followed by a
manual `claims["aud"] == self.identity` comparison is the standard way audience
verification gets disabled during debugging and never restored, because the manual
comparison keeps working and nothing looks wrong. Configuration that must be
actively removed beats a conditional that can be quietly inverted.
"""

from __future__ import annotations

import jwt

from agent_identity.claims import AgentPrincipal
from agent_identity.errors import TokenRejected
from agent_identity.keys import ALGORITHM


class ResourceServer:
    """An MCP-style server that validates every request on its own authority.

    Under a stateless protocol there is no connection to have decided this on, so
    validation is per request rather than per session — see Module 6.
    """

    def __init__(self, *, identity: str, trusted_issuer: str, issuer_public_key: bytes) -> None:
        #: The canonical URI clients name in `resource` and the AS stamps into `aud`.
        self.identity = identity
        self._trusted_issuer = trusted_issuer
        self._issuer_public_key = issuer_public_key

    def authenticate(self, token: str) -> AgentPrincipal:
        """Checks 1-4. Returns who is calling, or raises."""
        try:
            claims = jwt.decode(
                token,
                key=self._issuer_public_key,
                algorithms=[ALGORITHM],
                audience=self.identity,
                issuer=self._trusted_issuer,
                options={"require": ["exp", "aud", "iss", "sub"]},
            )
        except jwt.InvalidAudienceError as error:
            # The confused deputy: a real, signed, unexpired token — for someone else.
            # Accepting it here is what turns this server into an attacker's proxy.
            raise TokenRejected("audience does not name this server") from error
        except jwt.ExpiredSignatureError as error:
            raise TokenRejected("token has expired") from error
        except jwt.InvalidIssuerError as error:
            raise TokenRejected("issuer is not trusted") from error
        except jwt.PyJWTError as error:
            raise TokenRejected(f"token invalid: {type(error).__name__}") from error

        actor = claims.get("act")
        return AgentPrincipal(
            subject=str(claims["sub"]),
            actor=str(actor["sub"]) if actor else None,
            audience=str(claims["aud"]),
            scopes=frozenset(str(claims.get("scope", "")).split()),
        )

    def authorize(self, principal: AgentPrincipal, *, tool: str, required_scope: str) -> None:
        """Check 5, kept separate from identity so the audit log distinguishes them.

        Audience gets you in the door; it says nothing about which room.
        """
        if required_scope not in principal.scopes:
            raise TokenRejected(
                f"scope {required_scope!r} required for {tool!r}; "
                f"token carries {sorted(principal.scopes)}"
            )

    def call_tool(self, token: str, *, tool: str, required_scope: str) -> AgentPrincipal:
        """The whole path a tool invocation takes before any tool code runs."""
        principal = self.authenticate(token)
        self.authorize(principal, tool=tool, required_scope=required_scope)
        return principal
