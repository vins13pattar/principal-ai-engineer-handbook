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
- in-process RED metrics plus optional OpenTelemetry span hooks;
- graceful shutdown admission control;
- typed models and automated async tests.

The default app uses deterministic fake providers so it runs without API keys. The production-oriented adapters remain vendor-neutral.

## Run locally

```bash
cd examples/async-ai-gateway
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn ai_gateway.app:app --reload
```

Install optional production integrations:

```bash
pip install -e '.[dev,observability,redis]'
```

Generate a response:

```bash
curl -s http://127.0.0.1:8000/v1/generate \
  -H 'content-type: application/json' \
  -H 'x-request-id: demo-123' \
  -d '{"prompt":"Explain bounded concurrency","provider":"primary"}'
```

Inspect RED metrics:

```bash
curl -s http://127.0.0.1:8000/metrics
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
Identity + tenant resolution
  |-- Redis atomic quota -> 429
  |-- admission control -> 503
  |
FastAPI request telemetry
  |-- request ID + structured logs
  |-- RED metrics + OpenTelemetry span hook
  |
AsyncAIGateway
  |-- deadline + bounded concurrency
  |-- retry budget + jitter
  |-- health-aware provider routing
  |
FallbackProvider
  |-- circuit breaker per provider
  |-- ordered compatible fallback
  |
HTTPJSONProvider / DemoProvider
```

## Distributed rate limiting

`RedisTenantRateLimiter` executes the refill and consume operation inside one Lua script. This keeps the decision atomic across gateway replicas.

Production decisions still matter:

- **Fail closed:** protect spend and abuse limits, but Redis failure blocks traffic.
- **Fail open:** preserve availability, but quota and cost controls may be bypassed.
- **Local emergency bucket:** allow a small degraded allowance while Redis is unavailable.
- **Edge enforcement:** reject excessive traffic before it consumes application capacity.

Do not use tenant IDs supplied directly by an untrusted client. Resolve them from verified authentication claims.

## Observability

The lab includes three layers:

1. `ContextVar` request correlation and JSON event logs.
2. A small in-process RED collector for learning and tests.
3. Optional OpenTelemetry span hooks that degrade to no-ops when the package is absent.

In production, export counters and histograms rather than aggregating unbounded latency samples in process. Recommended dimensions include operation, provider, model, region, tenant tier, outcome, retry count, and stream/non-stream traffic. Avoid high-cardinality identifiers such as raw user IDs or request IDs in metric labels.

## Health-aware routing

`HealthAwareRouter` combines success rate, consecutive failures, and an exponential moving average of latency. Repeatedly failing providers are temporarily ejected.

This is intentionally educational. Production routing should also consider:

- model capability and context window;
- cost and tenant policy;
- region and data residency;
- provider quota headroom;
- streaming compatibility;
- minimum sample size and stale health data;
- active probes versus passive request observations.

## Principal-level discussion points

1. Semaphores bound concurrent work; token buckets bound arrival rate. Most production gateways require both.
2. A distributed quota decision needs atomic state mutation. A naive Redis `GET` followed by `SET` oversubscribes under concurrency.
3. Observability must distinguish queue wait, provider latency, retries, serialization, and stream duration.
4. Circuit breakers and health scores should be scoped by provider, model, endpoint, and sometimes region—not one global flag.
5. Streaming fallback is unsafe after partial output has reached the client.
6. Health-based routing can create feedback loops. Use bounded adjustments, minimum traffic probes, and explicit recovery behaviour.
7. Metric labels must be controlled to prevent cardinality-driven cost and reliability problems.

## Remaining exercises

- Wire authenticated tenant resolution into the FastAPI dependency layer.
- Connect `RedisTenantRateLimiter` to `redis.asyncio.Redis` and test against a real Redis container.
- Configure an OTLP exporter and instrument outbound `httpx` calls.
- Export Prometheus-compatible counters and histograms.
- Add SSE framing and client-disconnect cancellation.
- Add a latency-aware router integration inside `AsyncAIGateway`.
- Add contract tests for multiple OpenAI-compatible providers.
