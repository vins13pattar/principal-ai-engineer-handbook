# Async AI Gateway Lab

A production-oriented Python 3.12+ lab for learning how an AI gateway protects itself and its upstream providers under load.

## What this demonstrates

- asynchronous provider interfaces;
- bounded concurrency and queue-wait limits;
- request deadlines and cancellation;
- transient-failure retries with exponential backoff and jitter;
- circuit breaking and ordered provider fallback;
- a reusable `httpx.AsyncClient` adapter for OpenAI-compatible JSON and SSE APIs;
- streaming responses;
- global and per-tenant token-bucket rate limiting;
- graceful shutdown admission control;
- typed request and response models;
- automated async tests.

The default application still uses deterministic fake providers so the lab runs without API keys. `HTTPJSONProvider` shows how to connect a real OpenAI-compatible endpoint while preserving connection pooling, explicit timeouts, and streaming.

## Run locally

```bash
cd examples/async-ai-gateway
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn ai_gateway.app:app --reload
```

Generate a response:

```bash
curl -s http://127.0.0.1:8000/v1/generate \
  -H 'content-type: application/json' \
  -d '{"prompt":"Explain bounded concurrency","provider":"primary"}'
```

Stream a response:

```bash
curl -N http://127.0.0.1:8000/v1/stream \
  -H 'content-type: application/json' \
  -d '{"prompt":"Stream this response","provider":"secondary"}'
```

## Verify quality

```bash
pytest
ruff check .
mypy src
```

## Architecture

```text
Client
  |
FastAPI admission layer
  |-- tenant token bucket -> 429 when quota is exhausted
  |-- semaphore wait -> 503 when concurrency is saturated
  |
AsyncAIGateway
  |-- request deadline
  |-- retry policy with jitter
  |-- provider routing
  |-- streaming lifecycle
  |
FallbackProvider
  |-- circuit breaker per provider
  |-- ordered fallback policy
  |
HTTPJSONProvider / DemoProvider
```

## Principal-level discussion points

1. The semaphore limits concurrent work; it does not control request rate. Token buckets control rate; they do not bound in-flight latency or memory. Production systems commonly need both.
2. The in-memory tenant limiter is process-scoped. Multi-replica deployments need Redis, an API gateway, or another shared enforcement point.
3. Retrying inside the request deadline prevents retries from extending latency indefinitely.
4. A circuit breaker protects a failing dependency from continued traffic and gives it time to recover. It should be scoped by provider, model, region, or endpoint rather than globally.
5. Fallback is safe only when providers are semantically compatible. Differences in model behavior, safety policy, latency, cost, context limits, and data residency must be explicit.
6. Streaming fallback becomes dangerous after partial output is emitted because retrying can duplicate or contradict content. Select a healthy provider before the stream begins, or surface a terminal stream error.
7. HTTP clients should be long-lived and closed during application shutdown so connection pools are reused and sockets are released predictably.
8. A production gateway should add OpenTelemetry spans, RED metrics, structured logs, request IDs, provider health scores, idempotency where side effects exist, and distributed quota enforcement.

## Real provider example

```python
from ai_gateway.http_provider import HTTPJSONProvider

provider = HTTPJSONProvider(
    name="local-model",
    base_url="http://localhost:11434",
    model="my-model",
)
```

Wrap multiple compatible providers with circuit-aware fallback:

```python
from ai_gateway.fallback import FallbackProvider

resilient_provider = FallbackProvider([primary, secondary])
```

## Remaining exercises

- Wire `TenantRateLimiter` into the FastAPI dependency layer using an authenticated tenant ID.
- Replace local rate-limit state with Redis and document atomicity and fail-open/fail-closed choices.
- Add OpenTelemetry spans and RED metrics.
- Add SSE framing and client-disconnect cancellation.
- Add provider health scoring and latency-aware routing.
- Add contract tests for multiple OpenAI-compatible providers.
