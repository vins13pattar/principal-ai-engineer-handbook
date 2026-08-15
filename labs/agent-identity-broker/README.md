# Agent Identity Broker

Companion lab for [Module 15: Agent Identity and Access](https://handbook.vinodspattar.in/learn/modules/15-agent-identity/).

**Status: production-shaped.** It implements the mechanics faithfully and simulates the identity
provider. See [What is deliberately simulated](#what-is-deliberately-simulated) before reusing any
of it.

The lab exists to make one comparative claim testable rather than repeated: **a short-lived,
audience-bound, scope-narrowed credential bounds an agent's blast radius in a way a forwarded user
token does not.** `tests/test_blast_radius.py` measures that instead of asserting it.

## What it implements

| Piece | What it does |
| --- | --- |
| `broker.py` | RFC 8693 token exchange — narrows audience, scope, and lifetime in one step |
| `resource_server.py` | The five checks a resource server owes on every request |
| `blast_radius.py` | Walks one token against a whole fleet and reports what it opens |
| `demo.py` | Three servers, six tools, one destructive — enough for the comparison to be non-trivial |

The narrowing, in the terms the specs use:

- **Audience** comes from the `resource` parameter (RFC 8707), which the broker requires rather
  than accepts — a broker that lets callers omit it mints unbounded tokens by default.
- **Delegation** is recorded in the `act` claim (RFC 8693 §4.1), so the audit log can say
  *agent-a acting for u-1* rather than just *u-1*.
- **Who may act** is constrained by `may_act` in the user's own token, checked at exchange time.
- **Scope** can only ever be narrowed. Requesting a scope the subject does not hold is denied,
  because a narrowing mechanism that can widen is not a control.

## Run it

```bash
uv venv .venv && uv pip install --python .venv/bin/python -e '.[dev]'
./.venv/bin/python -m pytest -q
```

Three gates, the same ones every lab in this handbook is measured against:

```bash
./.venv/bin/python -m ruff check .
./.venv/bin/python -m mypy src
./.venv/bin/python -m pytest -q
```

## Prove the tests can fail

A passing security test is worth nothing until you have watched it fail. Disable audience
verification the way a debugging session would:

```python
# src/agent_identity/resource_server.py
options={"require": ["exp", "aud", "iss", "sub"], "verify_aud": False},
```

Six tests fail, across all three files. Put it back and they pass. That exercise is the point of
the lab: audience verification has no runtime symptom when it is missing — the system stays fully
functional and completely unprotected — so the only thing standing between you and a confused
deputy is a test that fails when the check goes away.

## What is deliberately simulated

- **The identity provider.** `keys.py` generates an in-memory RSA keypair per process. A real
  deployment has an IdP that owns the keys, publishes JWKS, and rotates on a schedule. There is no
  JWKS endpoint, no key rotation, and no caching here.
- **The authorization flow.** No browser redirect, no PKCE, no OIDC login. `issue_user_token()`
  hands you the credential a real sign-in would produce, so the lab can start where the interesting
  part starts.
- **Client registration.** Neither Dynamic Client Registration nor Client ID Metadata Documents are
  implemented. CIMD is an IETF draft (`draft-ietf-oauth-client-id-metadata-document-00`) that MCP
  only *SHOULD*s; this lab does not pretend to have picked a winner.
- **Revocation.** Short lifetimes are the only revocation mechanism here. There is no revocation
  list and no introspection endpoint.
- **Transport.** Everything is in-process. There is no HTTP surface, so nothing here exercises
  bearer-token handling over the wire, TLS, or the rule that tokens must never appear in a URL.

Each of those is why the label is `production-shaped` and not `production-ready`.

## Exercises

1. **Add the sixth check.** RFC 9068 conforming access tokens carry `typ: at+jwt`. Reject tokens
   that do not, and write the test first — including one that proves a token *with* the header still
   passes, so you know the new check is not simply rejecting everything.
2. **Break the broker's launder guard.** Remove the `presented_to` audience check in `exchange()`
   and find which test catches it. Then reason about what an attacker with any stolen token could do
   against the broker without it.
3. **Give the fleet a second issuer.** Add a server that trusts a different authorization server and
   confirm a token from the first is refused — the check that stops a partner's IdP from minting
   credentials for your systems.
4. **Make expiry a handled path.** Tokens live five minutes; give a task a step that sleeps past
   that and decide what should happen. Re-exchange, fail the task, or checkpoint and resume — the
   answer is a design decision, and it is the one long-running agents actually hit.

## References

- [MCP Authorization, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/)
- [RFC 8693: OAuth 2.0 Token Exchange](https://www.rfc-editor.org/rfc/rfc8693.html)
- [RFC 8707: Resource Indicators for OAuth 2.0](https://www.rfc-editor.org/rfc/rfc8707.html)
- [RFC 9068: JWT Profile for OAuth 2.0 Access Tokens](https://www.rfc-editor.org/rfc/rfc9068.html)
