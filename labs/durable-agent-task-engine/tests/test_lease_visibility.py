from __future__ import annotations

import pytest

from task_queue.errors import LeaseExpiredError
from task_queue.models import TaskStatus
from task_queue.store import InMemoryTaskStore


@pytest.mark.asyncio
async def test_leased_task_is_invisible_to_other_workers(clock) -> None:
    store = InMemoryTaskStore()
    await store.submit("ingest", "doc-1", {})

    lease = await store.lease("ingest", lease_seconds=30)
    assert lease is not None

    assert await store.lease("ingest", lease_seconds=30) is None


@pytest.mark.asyncio
async def test_expired_lease_is_reclaimed_for_a_new_worker(clock) -> None:
    store = InMemoryTaskStore()
    await store.submit("ingest", "doc-1", {})

    first_lease = await store.lease("ingest", lease_seconds=10)
    assert first_lease is not None
    assert first_lease.attempt == 1

    clock.advance(11)  # the worker holding first_lease has crashed

    second_lease = await store.lease("ingest", lease_seconds=10)
    assert second_lease is not None
    assert second_lease.task_id == first_lease.task_id
    assert second_lease.attempt == 2
    assert second_lease.token != first_lease.token


@pytest.mark.asyncio
async def test_ack_with_stale_lease_token_is_rejected(clock) -> None:
    store = InMemoryTaskStore()
    await store.submit("ingest", "doc-1", {})

    stale_lease = await store.lease("ingest", lease_seconds=10)
    assert stale_lease is not None
    clock.advance(11)
    await store.lease("ingest", lease_seconds=10)  # reclaimed by a "new" worker

    with pytest.raises(LeaseExpiredError):
        await store.ack(stale_lease.task_id, stale_lease.token)


@pytest.mark.asyncio
async def test_ack_marks_task_succeeded(clock) -> None:
    store = InMemoryTaskStore()
    submitted = await store.submit("ingest", "doc-1", {})

    lease = await store.lease("ingest", lease_seconds=10)
    assert lease is not None
    task = await store.ack(lease.task_id, lease.token)

    assert task.id == submitted.id
    assert task.status is TaskStatus.SUCCEEDED
