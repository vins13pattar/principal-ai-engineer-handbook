from __future__ import annotations

import asyncio
import time
from typing import Any

import pytest

from inference.batcher import DynamicBatcher
from inference.errors import BatcherClosedError


async def make_handler(*, sleep_seconds: float = 0.0, calls: list[list[Any]] | None = None):
    async def handler(payloads: list[Any]) -> list[Any]:
        if calls is not None:
            calls.append(list(payloads))
        await asyncio.sleep(sleep_seconds)
        return [f"out:{p}" for p in payloads]

    return handler


@pytest.mark.asyncio
async def test_batch_fires_immediately_once_full() -> None:
    calls: list[list[Any]] = []
    handler = await make_handler(sleep_seconds=0.05, calls=calls)
    batcher = DynamicBatcher(handler, max_batch_size=4, max_wait_seconds=5.0)
    task = asyncio.create_task(batcher.run())

    started = time.monotonic()
    results = await asyncio.gather(*(batcher.submit(i) for i in range(4)))
    elapsed = time.monotonic() - started

    assert results == ["out:0", "out:1", "out:2", "out:3"]
    assert len(calls) == 1  # one batch call, not four
    assert elapsed < 0.2  # far less than 4 * 0.05s serialized

    await batcher.shutdown()
    task.cancel()


@pytest.mark.asyncio
async def test_partial_batch_fires_after_max_wait() -> None:
    handler = await make_handler()
    batcher = DynamicBatcher(handler, max_batch_size=100, max_wait_seconds=0.03)
    task = asyncio.create_task(batcher.run())

    started = time.monotonic()
    result = await batcher.submit("solo")
    elapsed = time.monotonic() - started

    assert result == "out:solo"
    assert elapsed >= 0.025

    await batcher.shutdown()
    task.cancel()


@pytest.mark.asyncio
async def test_results_are_matched_to_the_right_request() -> None:
    handler = await make_handler()
    batcher = DynamicBatcher(handler, max_batch_size=5, max_wait_seconds=1.0)
    task = asyncio.create_task(batcher.run())

    results = await asyncio.gather(*(batcher.submit(f"req-{i}") for i in range(5)))

    assert results == [f"out:req-{i}" for i in range(5)]

    await batcher.shutdown()
    task.cancel()


@pytest.mark.asyncio
async def test_handler_exception_propagates_to_every_waiter_in_the_batch() -> None:
    async def failing_handler(payloads: list[Any]) -> list[Any]:
        raise RuntimeError("GPU out of memory")

    batcher = DynamicBatcher(failing_handler, max_batch_size=3, max_wait_seconds=1.0)
    task = asyncio.create_task(batcher.run())

    results = await asyncio.gather(
        *(batcher.submit(i) for i in range(3)), return_exceptions=True
    )

    assert all(isinstance(r, RuntimeError) for r in results)

    await batcher.shutdown()
    task.cancel()


@pytest.mark.asyncio
async def test_shutdown_flushes_pending_requests() -> None:
    handler = await make_handler(sleep_seconds=0.0)
    batcher = DynamicBatcher(handler, max_batch_size=100, max_wait_seconds=10.0)
    task = asyncio.create_task(batcher.run())

    submit_task = asyncio.create_task(batcher.submit("pending"))
    await asyncio.sleep(0.01)  # let it join the pending queue before shutdown flushes it
    await batcher.shutdown()

    assert await submit_task == "out:pending"
    task.cancel()


@pytest.mark.asyncio
async def test_submit_after_shutdown_is_rejected() -> None:
    handler = await make_handler()
    batcher = DynamicBatcher(handler, max_batch_size=10, max_wait_seconds=1.0)
    task = asyncio.create_task(batcher.run())

    await batcher.shutdown()
    with pytest.raises(BatcherClosedError):
        await batcher.submit("too-late")

    task.cancel()


@pytest.mark.asyncio
async def test_batching_gives_a_real_throughput_win_over_serial_calls() -> None:
    handler = await make_handler(sleep_seconds=0.05)
    batcher = DynamicBatcher(handler, max_batch_size=10, max_wait_seconds=5.0)
    task = asyncio.create_task(batcher.run())

    started = time.monotonic()
    await asyncio.gather(*(batcher.submit(i) for i in range(10)))
    elapsed = time.monotonic() - started

    # ten requests batched into one 0.05s call, not ten serial 0.05s calls (0.5s)
    assert elapsed < 0.25

    await batcher.shutdown()
    task.cancel()
