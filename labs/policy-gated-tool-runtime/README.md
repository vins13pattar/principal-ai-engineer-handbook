# Policy-Gated Tool Runtime Lab

**Status: `production-shaped`** — the enforcement pipeline and its tests are real; the registry,
rate limiter, approval queue, and audit log are in-memory and single-replica. See
[What would make this production-ready](#what-would-make-this-production-ready).

A Python 3.12+ lab for learning how to put a policy layer in front of agent tool calls, instead of trusting an agent's tool arguments directly.

## What this demonstrates

- a tool registry with per-tool JSON Schema input contracts;
- capability scoping, so an agent can only call the tools it was explicitly granted;
- JSON Schema argument validation before any handler runs;
- a per-(tenant, tool) token-bucket rate limiter;
- human-in-the-loop approval for high-risk tools, blocking the call until a decision is made or it times out;
- an append-only audit log recording every call attempt, allowed or denied;
- a FastAPI gateway exposing tool listing, tool calls, audit queries, and an approval decision endpoint;
- deterministic, clock-mocked async tests for every enforcement stage.

This is the enforcement layer that sits in front of tool execution. It is deliberately
**protocol-independent**: capability scoping, argument validation, per-tool rate limiting, approval
gates, and audit are the same problem whether the calls arrive over MCP, a bespoke HTTP API, or an
agent framework's in-process tool interface. Nothing here is MCP-specific, and the lab does not
implement the MCP wire protocol — see [Relationship to MCP](#relationship-to-mcp).

## Run locally

```bash
cd labs/policy-gated-tool-runtime
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn tool_gateway.app:app --reload
```

The app registers two demo tools: `search_knowledge_base` (low risk, read-only) and `issue_refund` (high risk, requires human approval).

List the registered tools and their schemas:

```bash
curl -s http://127.0.0.1:8000/v1/tools
```

Call the low-risk tool:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/tools/search_knowledge_base/call \
  -H 'content-type: application/json' \
  -H 'X-Agent-Id: demo-agent' \
  -H 'X-Tenant-Id: demo-tenant' \
  -H 'X-Scopes: tool:search_knowledge_base' \
  -d '{"arguments": {"query": "backpressure"}}'
```

Call the high-risk tool — this blocks until an operator approves or denies it, or the request times out:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/tools/issue_refund/call \
  -H 'content-type: application/json' \
  -H 'X-Agent-Id: demo-agent' \
  -H 'X-Tenant-Id: demo-tenant' \
  -H 'X-Scopes: tool:*' \
  -d '{"arguments": {"order_id": "o-1", "amount_usd": 25}}'
```

From another terminal, act as the approving operator:

```bash
curl -s http://127.0.0.1:8000/v1/approvals
curl -s -X POST http://127.0.0.1:8000/v1/approvals/<approval-id>/decide \
  -H 'content-type: application/json' \
  -d '{"approve": true, "decided_by": "ops-oncall"}'
```

Inspect the audit trail:

```bash
curl -s http://127.0.0.1:8000/v1/audit
```

## Verify quality

```bash
pytest
ruff check .
mypy src
```

GitHub Actions runs these checks for changes under `labs/policy-gated-tool-runtime`.

## Architecture

```text
Agent (caller)
  |-- X-Agent-Id / X-Tenant-Id / X-Scopes -> CallerIdentity
  |
ToolGateway.call()
  |-- 1. registry lookup           -> 404 if unknown
  |-- 2. capability scope check    -> 403 if not granted
  |-- 3. JSON Schema validation    -> 400 if malformed
  |-- 4. per-tenant token bucket   -> 429 if exhausted
  |-- 5. human approval (HIGH risk only) -> 403 denied / 504 timeout
  |-- 6. handler execution         -> 5xx mapped from handler errors
  |
AuditLog  (every stage above, allowed or denied, is recorded)
```

The sample accepts identity via `X-Agent-Id`, `X-Tenant-Id`, and `X-Scopes` headers only to keep the lab runnable without external infrastructure. In production, derive agent identity from a signed token issued by the agent runtime, not from client-supplied headers.

## Why this ordering

1. Cheap, stateless checks (scope, schema) run before anything that spends a shared resource (a rate-limit token) or a human's attention (an approval), so obviously-invalid calls fail fast and cheaply.
2. Attempt count for high-risk tools is not the same signal as failure count for retries: an approval that times out or gets denied is not the tool "failing," it is the tool being correctly refused. The gateway records this distinctly (`denied_approval`) rather than conflating it with a handler error.
3. The audit log records denials, not just successes. A spike in `denied_scope` entries for one agent is an operational signal — a misconfigured deployment or a compromised agent probing for access — not noise to discard.

## Principal-level discussion points

1. Scope checks answer "is this caller allowed to call this tool at all"; JSON Schema validation answers "is this specific call well-formed." Both are necessary; neither substitutes for the other.
2. Rate limits belong to the tool, not the gateway as a whole — a cheap read-only search and a fund-moving action should never share a budget.
3. Human-in-the-loop approval only works if the wait has a bounded timeout and a clear failure mode. An approval queue with no timeout is an outage waiting to happen the first time an operator is unavailable.
4. Counting a tool's delivery attempts (including approval timeouts) rather than only explicit failures is what stops a policy gap from being invisible: a tool nobody ever approves still shows up in the audit log, not just in application logs no one reads.
5. Fencing a tool call to the caller's declared identity, not the end user behind it, matters once an agent's actions no longer map one-to-one to a single human request.

## Relationship to MCP

This lab is **not an MCP implementation and does not claim to be one.** It implements the policy
layer an MCP server would sit in front of, not the protocol itself.

That distinction matters more than it used to. The MCP specification's `2026-07-28` revision removed
the `initialize` handshake and protocol-level sessions, requires `Mcp-Method` and `Mcp-Name` routing
headers on Streamable HTTP, and deprecated the HTTP+SSE transport. Anything describing itself as
"MCP-style" while implementing 2025-era JSON-RPC shapes is now describing a protocol that no longer
exists. Rather than approximate it, this lab stays on its own HTTP API and is honest about the
boundary.

Wiring it to real MCP hosts means putting an official SDK in front of `ToolGateway.call()` — the
enforcement pipeline itself needs no changes, which is the point of keeping it protocol-independent.
See [Module 6](https://handbook.vinodspattar.in/learn/modules/06-mcp/) for the
current protocol.

## What would make this production-ready

The enforcement pipeline — scope check, schema validation, rate limit, approval gate, audit — is
complete and tested at every stage. What is simulated is the storage behind each of those stages.

| Simulated here | Production needs |
| --- | --- |
| In-memory tool registry | A durable registry with versioned schemas and a rollout path for schema changes |
| In-process token buckets | A shared limiter (Redis Lua, as in `async-ai-gateway`) so replicas cannot oversubscribe a tenant |
| In-memory approval queue | Durable storage plus a notification hook — approvals must survive a restart, and must not rely on polling |
| In-memory audit log | Append-only durable storage; an audit log lost on restart is not an audit log |
| `x-agent-id` header identity | Verified signed identity (JWT or mTLS-derived) — the current header is trivially spoofable |

The identity gap is the one to fix first: every other control in the pipeline is scoped by caller
identity, so a spoofable caller header undermines all of them at once.

## Remaining exercises

- Put an MCP server in front of this runtime using an official SDK, so it can serve real MCP hosts. See [Relationship to MCP](#relationship-to-mcp) for what that involves under the current specification.
- Replace header-based identity with a verified, signed agent token (JWT or mTLS-derived).
- Replace the in-memory registry, rate limiter, approval queue, and audit log with durable, multi-replica-safe backends (Postgres, Redis).
- Add per-tool cost tracking and spend limits alongside the existing per-tool rate limits.
- Add a notification hook (Slack, PagerDuty, email) so pending approvals do not rely on someone polling `/v1/approvals`.
- Add contract tests for tool handlers so a schema change cannot silently drift from what a handler actually accepts.
