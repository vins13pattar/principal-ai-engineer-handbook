# Dynamic Batching Inference Lab

**Status: `production-shaped`** — the batching mechanism, canary routing, and benchmark harness are
real; the model call is a fixed-cost `asyncio.sleep` rather than a runtime. See
[What would make this production-ready](#what-would-make-this-production-ready).

A Python 3.12+ lab for learning the throughput/latency trade-off every model-serving system makes, and how to roll out a new model version without betting all your traffic on it at once.

## What this demonstrates

- dynamic batching: concurrent requests are grouped into one model call, bounded by either a max batch size or a max wait time, whichever comes first;
- a measurable throughput win from batching (many requests processed in roughly one call's latency, not each request's latency serialized);
- canary-based model version routing with configurable, independent traffic weights per version;
- per-version metrics (request count, error rate, mean latency), so a canary's behavior is observable before it gets more traffic;
- `promote` and `rollback` operations for moving traffic safely, without redeploying anything;
- a throughput and tail-latency benchmark harness with bounded concurrency and p50/p95/p99 reporting;
- a FastAPI service exposing inference, version management, and benchmarking;
- deterministic async tests for every stage, including one that proves the batching throughput win directly.

The "GPU work" here is a fixed-cost `asyncio.sleep` standing in for a real model call — see [Remaining exercises](#remaining-exercises) for what a production system would swap in.

## Run locally

```bash
cd labs/dynamic-batching-inference
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn inference.app:app --reload
```

The app starts with two demo model versions: `stable-v1` (weight 9, ~30ms simulated batch cost) and `canary-v2` (weight 1, ~15ms — an optimized version being evaluated on a small slice of traffic).

Run inference:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/infer \
  -H 'content-type: application/json' \
  -d '{"payload": 42}'
```

Pin a specific version:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/infer \
  -H 'content-type: application/json' \
  -d '{"payload": 42, "version": "canary-v2"}'
```

Check version weights and metrics:

```bash
curl -s http://127.0.0.1:8000/v1/versions
```

Promote the canary to all traffic, or roll it back:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/versions/canary-v2/promote
curl -s -X POST http://127.0.0.1:8000/v1/versions/canary-v2/rollback
```

Benchmark throughput and tail latency:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/benchmark \
  -H 'content-type: application/json' \
  -d '{"num_requests": 200, "concurrency": 20}'
```

## Verify quality

```bash
pytest
ruff check .
mypy src
```

GitHub Actions runs these checks for changes under `labs/dynamic-batching-inference`.

## Architecture

```text
Client
  |
POST /v1/infer {payload, version?}
  |
CanaryRouter.infer()
  |-- version given?  -> use it directly
  |-- else            -> choose_version(): weighted random pick across servable versions
  |
DynamicBatcher.submit(payload)     -- one batcher per model version
  |-- joins the pending queue, awaits its own future
  |-- run() loop flushes the batch at max_batch_size, or after max_wait_seconds
  |
handler(payloads) -> outputs       -- the simulated (or real) model call
  |
VersionMetrics updated             -- request_count, error_count, latency
  |
InferenceResult -> client
```

## Why the batcher is a factory, not a singleton

`create_app()` builds a fresh router and fresh batchers on every call rather than exposing one process-wide instance. A `DynamicBatcher` cannot be restarted once `shutdown()` has run — the same constraint a real batching worker has once its background task exits. Tests that need the batcher's background loop running (anything that calls `/v1/infer`) build their own isolated app via `create_app()` and enter its lifespan directly, instead of sharing global state across test runs.

## Principal-level discussion points

1. Batching trades a small, bounded amount of added latency (`max_wait_seconds`) for a large throughput gain, because the fixed cost of a model call gets amortized across many requests instead of paid once per request.
2. `max_batch_size` and `max_wait_seconds` are a single knob pair with opposing effects: tightening the wait time protects tail latency at low traffic; loosening it protects throughput at high traffic. Neither setting is "correct" independent of the actual traffic pattern and SLO.
3. Canary weighting only works as a safety mechanism if per-version metrics are tracked independently — a canary's error rate hiding inside an aggregate "overall error rate" defeats the entire point of a gradual rollout.
4. `promote` and `rollback` are cheap, reversible operations precisely because they only change routing weights, not infrastructure. Compare this to a deploy-based rollout, where "rollback" means redeploying the previous version.
5. A benchmark that reports only mean latency hides exactly the failure mode batching can introduce: a request that arrives just after a batch closes waits nearly a full `max_wait_seconds` longer than one that arrives just before. p95 and p99 catch that; the mean does not.

## What would make this production-ready

The batching mechanism, canary routing, per-version metrics, and percentile benchmark are complete
and tested. What is simulated is the thing being batched.

| Simulated here | Production needs |
| --- | --- |
| Fixed-cost `asyncio.sleep` per batch | A real runtime behind the same `BatchHandler` interface: Ray Serve, Triton, ONNX Runtime, or vLLM |
| Batch cost independent of batch contents | Real GPU behaviour, where cost varies with sequence length and padding — which changes the optimal batch size |
| No GPU-aware autoscaling | Scaling that accounts for cold-start time and idle cost, not just request rate |
| Metrics reset with each `CanaryRouter` | Durable per-version metrics that survive restarts and aggregate across replicas |

The second row is the one that matters most for interpreting this lab's numbers. A fixed per-batch
cost makes the throughput win look cleanly linear in batch size. Real inference cost grows with the
padded sequence length of the batch, so beyond some point a larger batch stops paying for itself —
a curve this lab cannot reproduce, and the reason the benchmark harness ships with a sweep exercise
rather than a recommended batch size.

## Remaining exercises

- Replace the simulated `asyncio.sleep` handlers with a real model runtime (Ray Serve, Triton, ONNX Runtime, or vLLM) behind the same `BatchHandler` interface.
- Add GPU-aware autoscaling that accounts for cold-start latency and idle cost, not just request rate.
- Add shadow evaluation: route a copy of production traffic to a candidate version without its output ever reaching the client, to compare quality before any real traffic shifts.
- Add automatic rollback triggered by a canary's error rate or latency crossing a threshold, instead of requiring a manual `/rollback` call.
- Persist per-version metrics across restarts instead of resetting them with every new `CanaryRouter`.
- Extend the benchmark harness to sweep `max_batch_size` and `max_wait_seconds` and report the resulting throughput/latency curve.
