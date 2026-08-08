from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

from .models import BenchmarkReport


def _percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    index = min(len(sorted_values) - 1, round(p * (len(sorted_values) - 1)))
    return sorted_values[index]


async def run_benchmark(
    submit: Callable[[], Awaitable[Any]],
    *,
    num_requests: int,
    concurrency: int,
) -> BenchmarkReport:
    """Fire ``num_requests`` through ``submit`` with bounded concurrency and report percentiles.

    Bounding concurrency models a realistic client: a fixed connection
    pool or worker count, not unlimited simultaneous requests all fired at
    once. Average latency hides tail behavior; p95 and p99 are what a
    batching or capacity change actually needs to be judged against.
    """
    semaphore = asyncio.Semaphore(concurrency)
    latencies_ms: list[float] = []
    errors = 0

    async def run_one() -> None:
        nonlocal errors
        async with semaphore:
            started = time.monotonic()
            try:
                await submit()
            except Exception:  # noqa: BLE001 - a failed request still counts toward the report
                errors += 1
            latencies_ms.append((time.monotonic() - started) * 1000)

    started_at = time.monotonic()
    await asyncio.gather(*(run_one() for _ in range(num_requests)))
    duration = time.monotonic() - started_at

    sorted_latencies = sorted(latencies_ms)
    return BenchmarkReport(
        total_requests=num_requests,
        error_count=errors,
        duration_seconds=duration,
        throughput_rps=num_requests / duration if duration > 0 else 0.0,
        p50_latency_ms=_percentile(sorted_latencies, 0.50),
        p95_latency_ms=_percentile(sorted_latencies, 0.95),
        p99_latency_ms=_percentile(sorted_latencies, 0.99),
        latencies_ms=tuple(sorted_latencies),
    )
