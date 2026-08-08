from __future__ import annotations

import asyncio

import pytest

from inference.benchmark import run_benchmark


@pytest.mark.asyncio
async def test_percentiles_are_monotonic_and_throughput_is_positive() -> None:
    async def submit() -> None:
        await asyncio.sleep(0.001)

    report = await run_benchmark(submit, num_requests=50, concurrency=10)

    assert report.total_requests == 50
    assert report.error_count == 0
    assert report.p50_latency_ms <= report.p95_latency_ms <= report.p99_latency_ms
    assert report.throughput_rps > 0


@pytest.mark.asyncio
async def test_concurrency_is_bounded() -> None:
    current = 0
    max_seen = 0

    async def submit() -> None:
        nonlocal current, max_seen
        current += 1
        max_seen = max(max_seen, current)
        await asyncio.sleep(0.01)
        current -= 1

    await run_benchmark(submit, num_requests=20, concurrency=3)
    assert max_seen <= 3


@pytest.mark.asyncio
async def test_errors_are_counted_without_aborting_the_run() -> None:
    calls = {"n": 0}

    async def submit() -> None:
        calls["n"] += 1
        if calls["n"] % 2 == 0:
            raise RuntimeError("simulated failure")

    report = await run_benchmark(submit, num_requests=10, concurrency=5)
    assert report.total_requests == 10
    assert report.error_count == 5


@pytest.mark.asyncio
async def test_slower_batches_show_up_in_higher_percentiles() -> None:
    calls = {"n": 0}

    async def submit() -> None:
        calls["n"] += 1
        # every 5th call is a slow outlier, like a batch that missed the fast path
        await asyncio.sleep(0.02 if calls["n"] % 5 == 0 else 0.001)

    report = await run_benchmark(submit, num_requests=30, concurrency=1)
    assert report.p99_latency_ms > report.p50_latency_ms
