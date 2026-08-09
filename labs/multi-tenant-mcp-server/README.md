# Multi-Tenant MCP Server Lab

**Status: `production-shaped`** — a real MCP server on the official SDK, speaking the `2026-07-28`
protocol over Streamable HTTP with transport-level authentication. The tenant registry is in-memory
and the bearer tokens are static. See
[What would make this production-ready](#what-would-make-this-production-ready).

A Python 3.12+ lab for serving many tenants from one MCP server without leaking one tenant's tools,
resources, or results to another.

## This is a real MCP server

It is built on the official `mcp` SDK (2.0.0), which reports `2026-07-28` as its only modern
protocol version. It is not a hand-rolled JSON-RPC service with MCP-shaped method names, and it is
not "MCP-style" — the tests drive it through the SDK's own client over the real Streamable HTTP
transport, so anything that works here works with a compliant host.

`stateless_http=True` is the current posture: no session is created, so any replica can serve any
request and a load balancer needs no affinity. That is only safe because tenant identity is
re-established from the `Authorization` header on every request rather than remembered per session.

## What this demonstrates

- **Transport-level authentication** via the SDK's `TokenVerifier` seam, so the credential is
  checked before any handler runs;
- **per-tenant tool and resource discovery** — each tenant's `tools/list` is filtered to its grants;
- **authorization separate from filtering** — `tools/call` is checked independently, because a
  caller can name a tool it never listed;
- **refusals that leak nothing** — an ungranted call returns a result byte-identical to a genuinely
  unknown tool, so a tenant cannot enumerate another's capabilities;
- **`cacheScope: private` on every tenant-scoped listing**, which is the difference between a
  cacheable response and a cross-tenant leak;
- **statelessness proven, not assumed** — a test drives three connections as alternating tenants
  against one server object and asserts no identity carries over;
- 11 tests, all over the real HTTP transport rather than in-process shortcuts.

## Why the credential is on the transport, not in `_meta`

Under `2026-07-28` every request is self-describing, which makes per-request application credentials
look natural — and `_meta` looks like the obvious place to put them.

It is the wrong place, and the failure is not subtle once you hit it. **An SDK makes protocol calls
that application code never issues.** Concretely: `call_tool()` internally invokes
`validate_tool_result()`, which issues its own `tools/list` to check the output schema, carrying no
`_meta`. A server authorizing on `_meta` therefore rejects its own client's internal call. A server
that exempts `tools/list` to work around it has reopened exactly the hole it was closing.

On the `Authorization` header the problem disappears, because every request the transport
sends — application-issued or SDK-internal — carries it. That is what
`tests/test_protocol_and_auth.py::test_the_credential_covers_the_sdks_own_internal_calls` pins.

This lab was built the wrong way first. The test that now passes is the one that failed.

## Run locally

```bash
cd labs/multi-tenant-mcp-server
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
python -m mcp_tenancy.app          # or mount build_asgi_app() under any ASGI server
```

Two demo tenants ship with the server:

| Token          | Tenant   | Granted tools                          |
| -------------- | -------- | -------------------------------------- |
| `tok-acme`     | `acme`   | `whoami`, `search_docs`, `issue_refund` |
| `tok-globex`   | `globex` | `whoami`, `search_docs`                 |

`globex`'s grants are a strict subset, which is what gives the isolation tests something asymmetric
to prove: `issue_refund` exists and is callable — just not by `globex`.

## Verify quality

```bash
pytest      # 11 tests, over the real Streamable HTTP transport
ruff check .
mypy src
```

## What would make this production-ready

| Simulated here | Production needs |
| --- | --- |
| Static bearer tokens in an in-memory registry | Tokens minted by an authorization server, with RFC 9207 issuer validation and credentials bound to the issuer |
| Dynamic Client Registration not used | Client ID Metadata Documents (CIMD), which replaced DCR in this revision |
| Tenant grants held in process memory | A durable, auditable grant store, with changes taking effect without a redeploy |
| No rate limiting or quota per tenant | Per-tenant limits — see [`labs/policy-gated-tool-runtime`](../policy-gated-tool-runtime/) for that enforcement pipeline |
| No audit log | Every call and refusal recorded, since refusals are the security-interesting half |

The authorization-server integration is the one to do first: everything else in the pipeline is
scoped by the resolved tenant, so the identity source is what the rest depends on.

## Remaining exercises

- Replace `TenantTokenVerifier` with a verifier that validates a real JWT against an authorization
  server's JWKS, checking the issuer per RFC 9207.
- Add per-tenant resources and prove read isolation the same way the tool tests prove call
  isolation.
- Add a `Mcp-Method`-aware rate limiter in front of the app, metering `tools/call` separately from
  `tools/list`.
- Add an audit log recording tenant, method, tool, and outcome for every request.
- Serve two replicas behind a load balancer with no affinity and confirm a multi-step interaction
  survives round-robin routing — the property `stateless_http=True` is supposed to buy.
