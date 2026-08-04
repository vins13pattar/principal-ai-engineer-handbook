from __future__ import annotations

import asyncio

import pytest

from ai_gateway.draining import DrainManager


@pytest.mark.asyncio
async def test_drain_waits_for_active_request() -> None:
    manager = DrainManager()
    entered = asyncio.Event()
    release = asyncio.Event()

    async def work() -> None:
        async with manager.request():
            entered.set()
            await release.wait()

    task = asyncio.create_task(work())
    await entered.wait()
    drain_task = asyncio.create_task(manager.drain(timeout_seconds=1))
    await asyncio.sleep(0)

    assert manager.accepting is False
    assert drain_task.done() is False

    release.set()
    await task
    assert await drain_task is True


@pytest.mark.asyncio
async def test_new_requests_are_rejected_while_draining() -> None:
    manager = DrainManager()
    assert await manager.drain(timeout_seconds=0.1) is True

    with pytest.raises(RuntimeError, match="draining"):
        async with manager.request():
            pass
