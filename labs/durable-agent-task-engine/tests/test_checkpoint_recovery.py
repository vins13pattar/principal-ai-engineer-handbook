from __future__ import annotations

import pytest

from task_queue.errors import LeaseExpiredError
from task_queue.store import InMemoryTaskStore


@pytest.mark.asyncio
async def test_checkpoint_survives_a_crashed_worker(clock) -> None:
    store = InMemoryTaskStore()
    await store.submit("imports", "batch-9", {"rows": 10_000}, max_attempts=5)

    lease = await store.lease("imports", lease_seconds=30)
    assert lease is not None
    assert lease.checkpoint is None

    await store.checkpoint(lease.task_id, lease.token, {"rows_imported": 4_000})

    clock.advance(31)  # the worker crashes before finishing or acking

    resumed = await store.lease("imports", lease_seconds=30)
    assert resumed is not None
    assert resumed.task_id == lease.task_id
    assert resumed.checkpoint == {"rows_imported": 4_000}


@pytest.mark.asyncio
async def test_checkpoint_merges_rather_than_replacing(clock) -> None:
    store = InMemoryTaskStore()
    await store.submit("imports", "batch-10", {}, max_attempts=5)

    lease = await store.lease("imports", lease_seconds=30)
    assert lease is not None

    await store.checkpoint(lease.task_id, lease.token, {"rows_imported": 1_000})
    await store.checkpoint(lease.task_id, lease.token, {"last_row_id": "row-1000"})

    task = await store.get(lease.task_id)
    assert task.checkpoint == {"rows_imported": 1_000, "last_row_id": "row-1000"}


@pytest.mark.asyncio
async def test_checkpoint_with_stale_lease_is_rejected(clock) -> None:
    store = InMemoryTaskStore()
    await store.submit("imports", "batch-11", {}, max_attempts=5)

    stale_lease = await store.lease("imports", lease_seconds=10)
    assert stale_lease is not None
    clock.advance(11)
    await store.lease("imports", lease_seconds=10)  # a new worker now owns the task

    with pytest.raises(LeaseExpiredError):
        await store.checkpoint(stale_lease.task_id, stale_lease.token, {"rows_imported": 1})
