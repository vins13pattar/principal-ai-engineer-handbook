from __future__ import annotations

import asyncio
from typing import Any

from .models import ModelVersion
from .router import CanaryRouter

STABLE_VERSION = "stable-v1"
CANARY_VERSION = "canary-v2"


async def stable_handler(payloads: list[Any]) -> list[Any]:
    # Simulates a fixed-cost GPU batch call: latency barely changes whether
    # the batch holds 1 request or the full max_batch_size.
    await asyncio.sleep(0.03)
    return [{"version": STABLE_VERSION, "prediction": f"class-{len(str(p)) % 3}"} for p in payloads]


async def canary_handler(payloads: list[Any]) -> list[Any]:
    # An optimized model version: faster per-batch, being evaluated on a
    # small slice of traffic before a full rollout.
    await asyncio.sleep(0.015)
    return [{"version": CANARY_VERSION, "prediction": f"class-{len(str(p)) % 3}"} for p in payloads]


def build_demo_router() -> CanaryRouter:
    router = CanaryRouter()
    router.register(
        ModelVersion(STABLE_VERSION, stable_handler, weight=9),
        max_batch_size=8,
        max_wait_seconds=0.02,
    )
    router.register(
        ModelVersion(CANARY_VERSION, canary_handler, weight=1),
        max_batch_size=8,
        max_wait_seconds=0.02,
    )
    return router
