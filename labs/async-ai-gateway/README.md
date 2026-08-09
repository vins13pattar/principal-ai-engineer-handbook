# Async AI Gateway Lab

A production-oriented Python 3.12+ lab for learning how an AI gateway protects itself and its upstream providers under load.

## What this demonstrates

- asynchronous provider interfaces;
- bounded concurrency and queue-wait limits;
- request deadlines, cancellation, retries, and jitter;
- circuit breaking and ordered provider fallback;
- reusable `httpx.AsyncClient` adapters for OpenAI-compatible JSON and SSE APIs;
- global, per-tenant, and Redis-backed token-bucket rate limiting;
- health-aware provider selection, ejection, and recovery;
- correlated structured logs and request IDs;
- RED metrics, Prometheus text output, and OpenTelemetry hooks;
- SSE framing and client-disconnect-aware streaming;
- liveness, readiness, Docker, Compose, and GitHub Actions CI;
- typed models and automated async tests.

The default app uses deterministic fake providers so it runs without API keys. The production-oriented adapters remain vendor-neutral.

## Run locally

```bash
cd labs/async-ai-gateway
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev,observability,redis,auth]'
uvicorn ai_gateway.production_app:app --reload
```

Generate a response:

```bash
curl -s http://127.0.0.1:8000/v1/generate \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: tenant-demo' \
  -H 'x-request-id: demo-123' \
  -d '{"prompt":"Explain bounded concurrency"}'
```

Stream with SSE:

```bash
curl -N http://127.0.0.1:8000/v1/stream \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: tenant-demo' \
  -d '{"prompt":"Stream this explanation"}'
```

Inspect health and metrics:

```bash
curl -s http://127.0.0.1:8000/health/live
curl -s http://127.0.0.1:8000/health/ready
curl -s http://127.0.0.1:8000/metrics/prometheus
```

## Run the local infrastructure stack

```bash
docker compose up --build
```

This starts:

- the gateway on port `8000`;
- Redis on port `6379`;
- an OpenTelemetry Collector on ports `4317` and `4318`;
- collector-exported Prometheus metrics on port `8889`.

## Verify quality

```bash
pytest
ruff check .
mypy src
```

GitHub Actions runs these checks for changes under `labs/async-ai-gateway`. A separate job starts Redis and executes Redis-focused integration tests.

## Architecture

```text
Client / API Gateway
  |
Verified identity -> tenant resolution
  |-- tenant quota -> 429
  |-- admission control -> 503
  |
FastAPI request telemetry
  |-- request ID + structured logs
  |-- RED metrics + Prometheus output
  |-- OpenTelemetry export hooks
  |
AsyncAIGateway
  |-- deadline + bounded concurrency
  |-- retry budget + jitter
  |-- health-aware provider selection
  |
Provider health state
  |-- success rate + latency EMA
  |-- temporary failure ejection
  |
HTTPJSONProvider / DemoProvider
```

## Integrated request path

`ai_gateway.production_app` demonstrates how the building blocks fit together:

1. Resolve a tenant from trusted request context.
2. Enforce a tenant-scoped quota before expensive work begins.
3. Attach or generate a request ID.
4. Emit structured lifecycle events.
5. Record RED metrics and tracing data.
6. Route through the bounded asynchronous gateway.
7. Select a healthy provider unless an explicit provider is requested.
8. Retry transient failures within the original deadline.
9. Return mapped HTTP failures.
10. Frame streaming output as SSE and stop work after client disconnect.

The sample accepts `x-tenant-id` only to keep the lab runnable. In production, derive tenant identity from verified JWT claims, mTLS identity, or a trusted upstream gateway.

## Health-aware routing policy

The selector tracks success rate, consecutive failures, and latency exponential moving average. Automatic routing may move to another provider after transient failure. An explicitly requested provider does not silently fall back because that could violate model, cost, compliance, or data-residency intent.

Health-based routing can create feedback loops. Production systems should retain minimum probe traffic, cap scoring adjustments, expire stale observations, and separate health by provider, model, endpoint, and region.

**Known characteristic: an untried provider outranks a recovered one.** `ProviderHealth.success_rate`
returns `1.0` when there are no samples at all, so a provider that has never been called scores a
perfect 1.0 while one that failed twice and then recovered carries 1/3. Ejection expiry therefore
restores *eligibility*, not preference — the recovered provider becomes selectable again but still
ranks below an untried peer until it accumulates successes.

That is defensible (an untried provider has no evidence against it) and it is also a cold-start bias
worth knowing about: the router will explore an unknown provider ahead of a known-recovered one.
`test_an_untried_provider_outranks_one_that_has_recovered` pins the behaviour so it stays a decision
rather than an accident. Giving a zero-sample provider a neutral prior instead of a perfect score is
the usual fix, and is listed under [Remaining exercises](#remaining-exercises).

## Distributed rate limiting

A Redis-backed limiter executes refill and consume operations inside one Lua script, keeping the decision atomic across gateway replicas.

- **Fail closed:** protects spend and abuse limits, but Redis failure blocks traffic.
- **Fail open:** preserves availability, but quota controls may be bypassed.
- **Local emergency bucket:** allows a small degraded allowance during Redis outages.
- **Edge enforcement:** rejects excessive traffic before application capacity is consumed.

## Principal-level discussion points

1. Semaphores bound concurrent work; token buckets bound arrival rate. Production gateways usually need both.
2. A distributed quota decision needs atomic state mutation; naive `GET` then `SET` oversubscribes under concurrency.
3. Observability must distinguish queue wait, provider latency, retry delay, serialization, first-token latency, and stream duration.
4. Streaming fallback is unsafe after partial output reaches the client.
5. Explicit provider choice should generally override automatic fallback policy.
6. Readiness reflects whether traffic can be accepted safely; liveness only indicates whether the process should be restarted.
7. CI should validate code quality and integration behaviour, not only unit tests.

## Remaining exercises

- Replace `success_rate`'s optimistic 1.0 for zero samples with a neutral prior (a smoothed estimate
  such as `(successes + 1) / (total + 2)`), so an untried provider does not outrank a recovered one
  purely for lack of evidence.
- Replace the sample tenant header with JWT or mTLS-derived identity.
- Wire `RedisTenantRateLimiter` into the production app through configuration.
- Configure a real OTLP SDK exporter and instrument outbound `httpx` calls.
- Replace the educational Prometheus renderer with a production metrics SDK.
- Add stream duration, disconnect, and first-token-latency metrics.
- Add provider capability, cost, region, and data-residency routing policies.
- Add contract tests for multiple OpenAI-compatible providers.
