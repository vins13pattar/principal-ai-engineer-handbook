# Async AI Gateway Lab

A production-oriented Python 3.12+ lab for learning how an AI gateway protects itself and its upstream providers under load.

## What this demonstrates

- asynchronous provider interfaces;
- bounded concurrency and queue-wait limits;
- request deadlines and cancellation;
- transient-failure retries with exponential backoff and jitter;
- provider selection;
- streaming responses;
- in-process token-bucket rate limiting;
- graceful shutdown admission control;
- typed request and response models;
- automated async tests.

The included providers are deterministic fakes so the lab runs without API keys. Replace `DemoProvider` with adapters built on `httpx.AsyncClient` for real providers.

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
  |-- token bucket -> 429 when quota is exhausted
  |-- semaphore wait -> 503 when concurrency is saturated
  |
AsyncAIGateway
  |-- request deadline
  |-- retry policy with jitter
  |-- provider routing
  |-- streaming lifecycle
  |
Provider adapter
```

## Principal-level discussion points

1. The semaphore limits concurrent work; it does not control request rate. The token bucket controls request rate; it does not bound in-flight latency or memory. Production systems commonly need both.
2. The local token bucket is process-scoped. Multi-replica deployments require shared or edge-enforced quotas.
3. Retrying inside the request deadline prevents retries from extending latency indefinitely.
4. Streaming holds a concurrency permit for the stream lifetime. Separate limits may be required for streaming and non-streaming traffic.
5. A production gateway should add identity-aware quotas, circuit breakers, provider health scores, metrics, tracing, structured logs, and idempotency where side effects exist.

## Exercises

- Add an `httpx.AsyncClient` provider adapter with connection pooling.
- Add per-tenant limits rather than one global bucket.
- Add a circuit breaker and provider fallback policy.
- Emit OpenTelemetry spans and RED metrics.
- Add SSE framing and client-disconnect cancellation.
- Move rate-limit state to Redis and discuss consistency trade-offs.
