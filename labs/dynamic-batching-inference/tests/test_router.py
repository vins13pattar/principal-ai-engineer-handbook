from __future__ import annotations

import asyncio
import random
from typing import Any

import pytest

from inference.errors import NoServableVersionError, UnknownVersionError
from inference.models import ModelVersion
from inference.router import CanaryRouter


async def echo_handler(payloads: list[Any]) -> list[Any]:
    return list(payloads)


async def failing_handler(payloads: list[Any]) -> list[Any]:
    raise RuntimeError("downstream model server unavailable")


def build_router(*, stable_weight: float = 9, canary_weight: float = 1) -> CanaryRouter:
    router = CanaryRouter()
    router.register(
        ModelVersion("stable", echo_handler, weight=stable_weight), max_wait_seconds=0.01
    )
    router.register(
        ModelVersion("canary", echo_handler, weight=canary_weight), max_wait_seconds=0.01
    )
    return router


async def run_with_batchers(router: CanaryRouter, coro):
    tasks = [asyncio.create_task(b.run()) for b in router.batchers()]
    try:
        return await coro
    finally:
        for batcher in router.batchers():
            await batcher.shutdown()
        for task in tasks:
            task.cancel()


@pytest.mark.asyncio
async def test_explicit_version_bypasses_weighting() -> None:
    router = build_router(stable_weight=1, canary_weight=0)

    async def body():
        result = await router.infer("x", version="canary")
        assert result.version == "canary"

    await run_with_batchers(router, body())


@pytest.mark.asyncio
async def test_weighted_routing_approximates_the_configured_split() -> None:
    router = build_router(stable_weight=9, canary_weight=1)
    rng = random.Random(1234)

    async def body():
        counts = {"stable": 0, "canary": 0}
        for i in range(300):
            result = await router.infer(i, rng=rng)
            counts[result.version] += 1
        return counts

    counts = await run_with_batchers(router, body())
    # not an exact 90/10 split, but nowhere near 50/50 either
    assert counts["stable"] > counts["canary"] * 3


@pytest.mark.asyncio
async def test_metrics_accumulate_across_calls() -> None:
    router = build_router()

    async def body():
        for i in range(5):
            await router.infer(i, version="stable")
        return router.metrics("stable")

    metrics = await run_with_batchers(router, body())
    assert metrics.request_count == 5
    assert metrics.error_count == 0
    assert metrics.mean_latency_ms >= 0.0


@pytest.mark.asyncio
async def test_handler_failure_is_recorded_as_an_error_and_reraised() -> None:
    router = CanaryRouter()
    router.register(ModelVersion("flaky", failing_handler, weight=1), max_wait_seconds=0.01)

    async def body():
        with pytest.raises(RuntimeError):
            await router.infer("x", version="flaky")
        return router.metrics("flaky")

    metrics = await run_with_batchers(router, body())
    assert metrics.request_count == 1
    assert metrics.error_count == 1
    assert metrics.error_rate == 1.0


@pytest.mark.asyncio
async def test_promote_routes_all_traffic_to_the_target_version() -> None:
    router = build_router(stable_weight=9, canary_weight=1)
    router.promote("canary")

    versions = {v.version: v.weight for v in router.list_versions()}
    assert versions == {"stable": 0.0, "canary": 1.0}


@pytest.mark.asyncio
async def test_rollback_only_affects_the_target_version() -> None:
    router = build_router(stable_weight=9, canary_weight=1)
    router.rollback("canary")

    versions = {v.version: v.weight for v in router.list_versions()}
    assert versions == {"stable": 9.0, "canary": 0.0}


@pytest.mark.asyncio
async def test_infer_with_unknown_version_raises() -> None:
    router = build_router()

    async def body():
        with pytest.raises(UnknownVersionError):
            await router.infer("x", version="does-not-exist")

    await run_with_batchers(router, body())


def test_choose_version_with_no_servable_version_raises() -> None:
    router = build_router(stable_weight=0, canary_weight=0)
    with pytest.raises(NoServableVersionError):
        router.choose_version()
