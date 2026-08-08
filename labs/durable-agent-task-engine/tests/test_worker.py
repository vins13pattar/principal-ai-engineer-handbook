from __future__ import annotations

import asyncio
from typing import Any

import pytest

from task_queue.demo import FlakyDemoHandler
from task_queue.models import TaskStatus
from task_queue.store import InMemoryTaskStore
from task_queue.worker import TaskContext, Worker


async def wait_until(predicate, *, timeout_seconds: float = 2.0, interval: float = 0.01) -> None:
    async with asyncio.timeout(timeout_seconds):
        while not predicate():  # noqa: ASYNC110 - test polling helper, not production code
            await asyncio.sleep(interval)


@pytest.mark.asyncio
async def test_worker_retries_then_succeeds_and_resumes_from_checkpoint() -> None:
    store = InMemoryTaskStore()
    handler = FlakyDemoHandler(fail_before_attempt=3, steps=2)
    worker = Worker(
        store,
        "demo",
        handler,
        concurrency=2,
        lease_seconds=1.0,
        poll_interval=0.01,
        backoff=lambda _attempt: 0.01,
    )
    submitted = await store.submit("demo", "job-1", {}, max_attempts=5)
    run_task = asyncio.create_task(worker.run())
    try:
        await wait_until(lambda: any(r.outcome == "succeeded" for r in worker.results))
    finally:
        await worker.shutdown(timeout_seconds=1.0)
        run_task.cancel()

    final = await store.get(submitted.id)
    assert final.status is TaskStatus.SUCCEEDED
    assert final.attempts == 3
    assert final.checkpoint == {"steps_completed": 2}


@pytest.mark.asyncio
async def test_worker_dead_letters_after_exhausting_retries() -> None:
    store = InMemoryTaskStore()

    async def always_fails(payload: dict[str, Any], ctx: TaskContext) -> None:
        raise RuntimeError("downstream permanently unavailable")

    worker = Worker(
        store,
        "demo",
        always_fails,
        concurrency=1,
        lease_seconds=1.0,
        poll_interval=0.01,
        backoff=lambda _attempt: 0.01,
    )
    submitted = await store.submit("demo", "job-2", {}, max_attempts=2)
    run_task = asyncio.create_task(worker.run())
    try:
        await wait_until(lambda: any(r.outcome == "dead_letter" for r in worker.results))
    finally:
        await worker.shutdown(timeout_seconds=1.0)
        run_task.cancel()

    final = await store.get(submitted.id)
    assert final.status is TaskStatus.DEAD_LETTER
    assert final.attempts == 2


@pytest.mark.asyncio
async def test_worker_bounds_concurrent_handlers() -> None:
    store = InMemoryTaskStore()
    current = 0
    max_seen = 0
    release = asyncio.Event()

    async def slow_handler(payload: dict[str, Any], ctx: TaskContext) -> None:
        nonlocal current, max_seen
        current += 1
        max_seen = max(max_seen, current)
        await release.wait()
        current -= 1

    worker = Worker(
        store, "demo", slow_handler, concurrency=2, lease_seconds=5.0, poll_interval=0.01
    )
    for i in range(5):
        await store.submit("demo", f"job-{i}", {})

    run_task = asyncio.create_task(worker.run())
    try:
        await wait_until(lambda: current == 2)
        await asyncio.sleep(0.05)  # give a would-be third handler a chance to start
        assert current == 2
        assert max_seen == 2
    finally:
        release.set()
        await worker.shutdown(timeout_seconds=1.0)
        run_task.cancel()


@pytest.mark.asyncio
async def test_shutdown_waits_for_in_flight_work_before_returning() -> None:
    store = InMemoryTaskStore()
    started = asyncio.Event()
    release = asyncio.Event()

    async def blocking_handler(payload: dict[str, Any], ctx: TaskContext) -> None:
        started.set()
        await release.wait()

    worker = Worker(
        store, "demo", blocking_handler, concurrency=1, lease_seconds=5.0, poll_interval=0.01
    )
    await store.submit("demo", "job-slow", {})
    run_task = asyncio.create_task(worker.run())

    await wait_until(lambda: started.is_set())
    shutdown_task = asyncio.create_task(worker.shutdown(timeout_seconds=1.0))
    await asyncio.sleep(0.05)
    assert shutdown_task.done() is False

    release.set()
    assert await shutdown_task is True
    run_task.cancel()
