# Async AI Gateway Lab

A production-oriented Python 3.12+ lab for learning how an AI gateway protects itself and its upstream providers under load.

## What this demonstrates

- asynchronous provider interfaces;
- bounded concurrency and queue-wait limits;
- request deadlines, cancellation, retries, and jitter;
- circuit breaking and ordered provider fallback;
- reusable `httpx.AsyncClient` adapters for OpenAI-compatible JSON and SSE APIs;
- global, per-tenant, and Redis-backed token-bucket rate limiting;
- provider health scoring, temporary ejection, and latency-aware routing;
- correlated structured logs and request IDs;
- RED metrics, Prometheus text output, and optional OpenTelemetry span hooks;
- SSE framing and client-disconnect-aware streaming;
- liveness and readiness endpoints;
- graceful shutdown admission control;
- typed models and automated async tests.

The default app uses deterministic fake providers so it runs without API keys. The production-oriented adapters remain vendor-neutral.

## Run locally

```bash
cd examples/async-ai-gateway
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn ai_gateway.production_app:app --reload
```

Install optional production integrations:

```bash
pip install -e '.[dev,observability,redis]'
```

Generate a response:

```bash
curl -s http://127.0.0.1:8000/v1/generate \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: tenant-demo' \
  -H 'x-request-id: demo-123' \
  -d '{"prompt":"Explain bounded concurrency","provider":"primary"}'
```

Stream with SSE:

```bash
curl -N http://127.0.0.1:8000/v1/stream \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: tenant-demo' \
  -d '{"prompt":"Stream this explanation","provider":"primary"}'
```

Inspect metrics:

```bash
curl -s http://127.0.0.1:8000/metrics
curl -s http://127.0.0.1:8000/metrics/prometheus
```

## Verify quality

```bash
pytest
ruff check .
mypy src
```

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
  |-- optional OpenTelemetry spans
  |
AsyncAIGateway
  |-- deadline + bounded concurrency
  |-- retry budget + jitter
  |-- provider selection
  |
Fallback / health-aware routing layer
  |-- circuit breaker per provider
  |-- compatible provider fallback
  |
HTTPJSONProvider / DemoProvider
```

## Integrated request path

`ai_gateway.production_app` demonstrates how the individual building blocks fit together:

1. Resolve a tenant from request context.
2. Enforce a tenant-scoped quota before expensive work begins.
3. Attach or generate a request ID.
4. Emit structured lifecycle events.
5. Record RED metrics.
6. Route through the bounded asynchronous gateway.
7. Return mapped HTTP failures.
8. Frame streaming output as SSE and stop work after client disconnect.

The sample accepts `x-tenant-id` only to keep the lab runnable. In production, derive tenant identity from verified JWT claims, mTLS identity, or a trusted upstream gateway. Never trust a caller-supplied tenant header directly.

## Distributed rate limiting

A Redis-backed limiter can execute refill and consume operations inside one Lua script, keeping the decision atomic across gateway replicas.

Production decisions still matter:

- **Fail closed:** protects spend and abuse limits, but Redis failure blocks traffic.
- **Fail open:** preserves availability, but quota and cost controls may be bypassed.
- **Local emergency bucket:** allows a small degraded allowance while Redis is unavailable.
- **Edge enforcement:** rejects excessive traffic before it consumes application capacity.

## Observability

The lab includes four layers:

1. `ContextVar` request correlation and JSON event logs.
2. A small in-process RED collector for learning and tests.
3. Prometheus-compatible text exposition.
4. Optional OpenTelemetry span hooks.

In production, export counters and histograms rather than aggregating unbounded latency samples in process. Recommended dimensions include operation, provider, model, region, tenant tier, outcome, retry count, and stream/non-stream traffic. Avoid request IDs and raw user IDs in metric labels.

## Health-aware routing

A health-aware router can combine success rate, consecutive failures, and an exponential moving average of latency. Repeatedly failing providers should be temporarily ejected and periodically probed for recovery.

Production routing should also consider:

- model capability and context window;
- cost and tenant policy;
- region and data residency;
- provider quota headroom;
- streaming compatibility;
- minimum sample size and stale health data;
- active probes versus passive observations.

## Principal-level discussion points

1. Semaphores bound concurrent work; token buckets bound arrival rate. Most production gateways require both.
2. A distributed quota decision needs atomic state mutation. A naive Redis `GET` followed by `SET` oversubscribes under concurrency.
3. Observability must distinguish queue wait, provider latency, retries, serialization, and stream duration.
4. Circuit breakers and health scores should be scoped by provider, model, endpoint, and sometimes region—not one global flag.
5. Streaming fallback is unsafe after partial output has reached the client.
6. Health-based routing can create feedback loops. Use bounded adjustments, minimum traffic probes, and explicit recovery behaviour.
7. Metric labels must be controlled to prevent cardinality-driven cost and reliability problems.
8. Readiness should reflect whether the process can safely accept traffic; liveness should only indicate whether it should be restarted.

## Remaining exercises

- Replace the sample tenant header with JWT or mTLS-derived identity.
- Connect the Redis limiter to a real Redis container and test fail-open/fail-closed behaviour.
- Configure an OTLP exporter and instrument outbound `httpx` calls.
- Replace the educational Prometheus renderer with a production metrics SDK.
- Integrate the health-aware router directly into provider selection.
- Add stream duration, disconnect, and first-token-latency metrics.
- Add contract tests for multiple OpenAI-compatible providers.
