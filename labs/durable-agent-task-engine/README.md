# Durable Agent Task Engine Lab

**Status: `production-shaped`** — the state machine, lease fencing, and failure handling are real
and exhaustively tested; the store is in-memory and single-process by design. See
[What would make this production-ready](#what-would-make-this-production-ready).

A Python 3.12+ lab for learning how a durable task queue keeps agent and background work correct under crashes, retries, and duplicate requests.

## What this demonstrates

- idempotent task submission keyed by a client-supplied idempotency key;
- lease-based checkout with a visibility timeout, so a task is invisible to other workers only while a lease is held;
- automatic redelivery when a worker crashes and its lease expires, with no external supervisor;
- lease fencing: a stale worker's late ack, fail, or checkpoint is rejected once its lease has been reclaimed;
- exponential backoff with full jitter between retries;
- dead-letter handling once a task exhausts its delivery attempts, including from repeated crashes and not only explicit failures;
- operator-triggered dead-letter requeue;
- checkpointing, so a resumed task continues from recorded progress instead of restarting;
- a bounded-concurrency async worker with graceful shutdown that drains in-flight work;
- a FastAPI submission/status/dead-letter API;
- deterministic, clock-mocked async tests for every failure mode above.

The in-memory store makes every state transition explicit and single-process; it is written as a specification for what a durable backend (Postgres `SELECT ... FOR UPDATE SKIP LOCKED`, or a Redis-backed store) must guarantee atomically. See [Remaining exercises](#remaining-exercises).

## Run locally

```bash
cd labs/durable-agent-task-engine
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn task_queue.app:app --reload
```

The app starts with an in-process demo worker consuming a `demo` queue with a handler that fails its first two attempts and succeeds on the third, so you can watch retries and checkpointing happen.

Submit a task (idempotency key required):

```bash
curl -s -X POST http://127.0.0.1:8000/v1/queues/orders/tasks \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: order-42-confirmation' \
  -d '{"payload": {"order_id": "42"}, "max_attempts": 5}'
```

Resubmitting the same `Idempotency-Key` returns the original task instead of creating a duplicate.

Check status:

```bash
curl -s http://127.0.0.1:8000/v1/tasks/<task-id>
```

Inspect and requeue dead-lettered tasks:

```bash
curl -s http://127.0.0.1:8000/v1/queues/orders/dead-letter
curl -s -X POST http://127.0.0.1:8000/v1/tasks/<task-id>/requeue
```

## Verify quality

```bash
pytest
ruff check .
mypy src
```

GitHub Actions runs these checks for changes under `labs/durable-agent-task-engine`.

## Architecture

```text
Client
  |-- Idempotency-Key -> dedupe on (queue, key)
  |
InMemoryTaskStore
  |-- submit(): create-or-return existing task
  |-- lease(): reclaim expired leases, then hand out the oldest eligible task
  |-- ack() / fail() / checkpoint() / heartbeat(): fenced by lease token
  |-- list_dead_letter() / requeue_dead_letter()
  |
Worker
  |-- bounded concurrency (semaphore)
  |-- lease -> handler(payload, ctx) -> ack | fail
  |-- exponential backoff with jitter on failure
  |-- graceful shutdown drains in-flight handlers
  |
TaskContext
  |-- ctx.checkpoint: resumable progress from the last attempt
  |-- ctx.save_checkpoint(state): record progress mid-task
  |-- ctx.heartbeat(): extend the lease for long-running work
```

## The lease lifecycle

A task cycles between `pending` and `leased` until it reaches a terminal state (`succeeded` or `dead_letter`):

1. `submit()` creates a `pending` task, or returns the existing one for a reused idempotency key.
2. `lease()` first reclaims any `leased` task whose visibility timeout has passed — this is the queue's crash recovery: a worker that died without acking or failing never blocks the task forever.
3. `lease()` then hands out the oldest eligible `pending` task, incrementing its delivery attempt count and assigning a fresh, unguessable lease token.
4. The worker's `ack()`, `fail()`, `checkpoint()`, and `heartbeat()` calls must present that exact token. If the lease already expired and was reclaimed, the call raises `LeaseExpiredError` instead of corrupting the new holder's work — this is fencing.
5. `fail()` schedules a retry with exponential backoff, unless the attempt count has reached `max_attempts`, in which case the task moves to `dead_letter`.
6. A task can also reach `dead_letter` purely from repeated crashes: each reclaimed redelivery still counts as a delivery attempt, so a task that never gets an explicit failure or success eventually stops being retried.

## Checkpointing and resumability

Long-running or multi-step tasks (batch imports, multi-call agent workflows, document pipelines) should not restart from zero after every crash. A handler calls `ctx.save_checkpoint({...})` after each unit of progress; the checkpoint is attached to the task and handed back through `ctx.checkpoint` on the next attempt, whether that attempt comes from an explicit retry or from crash-driven redelivery. `task_queue.demo.FlakyDemoHandler` is a runnable example of this pattern.

## Principal-level discussion points

1. A visibility timeout implements crash recovery without a separate heartbeat supervisor: if nobody proves they're still working, the work becomes available again.
2. Idempotent submission and idempotent handlers are different concerns. Deduping by key avoids creating duplicate *tasks*; the handler itself still needs to be safe to run more than once, because at-least-once delivery is the achievable guarantee, not exactly-once.
3. Lease fencing (rejecting a stale token) is what stops a "zombie" worker — one that's still running past its lease's expiry — from double-processing an already-reclaimed task's ack or checkpoint.
4. Dead-lettering after N *delivery attempts*, not N *explicit failures*, closes a real gap: a task whose worker keeps crashing before it can call `fail()` must still stop retrying eventually.
5. Checkpointing turns "restart from scratch" into "resume from last known-good progress," which matters most exactly when it's hardest to test: mid-crash.
6. Requeueing from the dead-letter queue is an operator action, not an automatic one — a task usually lands there because something needs a human or a fixed dependency, not another blind retry.
7. This store's single lock is fine for one process; a multi-replica deployment needs the same atomicity guarantees from the backing store (row-level locking with `SKIP LOCKED`, or an atomic Lua script), not just from application code.

## What would make this production-ready

This lab is labelled `production-shaped`. The distinction is narrower here than in most labs: the
state machine, lease fencing, retry accounting, and dead-lettering are complete and tested against
every failure mode they claim to handle. What is simulated is the *durability* — the one property
the lab is named for.

| Simulated here | Production needs |
| --- | --- |
| `InMemoryTaskStore` behind a single `asyncio.Lock` | A store whose `lease()` is atomic across processes: Postgres `SELECT ... FOR UPDATE SKIP LOCKED`, or an atomic Redis Lua script |
| State lost on process exit | Durable storage, so a restart resumes rather than forgets |
| Single event loop, single process | Multi-replica deployment with real lease contention |
| No metrics surface | Queue depth, lease age, retry count, and dead-letter rate, with alerting on stuck queues |

The in-memory store is deliberate, not a shortcut: it makes every state transition explicit and
readable, and it is written as a *specification* for what a durable backend must guarantee
atomically. Swapping it is an implementation of the existing interface, not a redesign.

**Known upstream warning.** The test suite emits one `StarletteDeprecationWarning` — FastAPI's
`testclient` module reports that pairing `httpx` with `starlette.testclient` is deprecated in
favour of `httpx2`. It comes from the dependency, not from this lab's code, and is left visible
rather than suppressed because it is a real signal about an upcoming dependency refresh.
`TestClient` is used deliberately here: it drives the ASGI lifespan that starts the background
worker, which `httpx.ASGITransport` does not.

## Remaining exercises

- Replace `InMemoryTaskStore` with a Postgres-backed store using `SELECT ... FOR UPDATE SKIP LOCKED` for `lease()`.
- Add a Redis Streams or SQS-backed store as a second implementation of the same interface.
- Add a metrics surface (queue depth, lease age, retry count, dead-letter rate) suitable for alerting on stuck queues.
- Add a scheduled sweep that pages an operator when the dead-letter queue grows past a threshold.
- Extend `TaskContext` with cancellation support so a handler can react to a task being canceled mid-run.
- Add multi-worker, multi-process integration tests to exercise real contention instead of a single event loop.
