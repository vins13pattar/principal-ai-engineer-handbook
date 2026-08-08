from __future__ import annotations

import pytest

from task_queue.models import TaskStatus
from task_queue.store import InMemoryTaskStore


@pytest.mark.asyncio
async def test_failed_task_becomes_visible_after_backoff(clock) -> None:
    store = InMemoryTaskStore()
    await store.submit("webhooks", "evt-1", {}, max_attempts=5)

    lease = await store.lease("webhooks", lease_seconds=10)
    assert lease is not None

    await store.fail(lease.task_id, lease.token, error="upstream 500", retry_in_seconds=30)

    assert await store.lease("webhooks", lease_seconds=10) is None

    clock.advance(31)

    retried = await store.lease("webhooks", lease_seconds=10)
    assert retried is not None
    assert retried.task_id == lease.task_id
    assert retried.attempt == 2


@pytest.mark.asyncio
async def test_task_moves_to_dead_letter_after_max_attempts(clock) -> None:
    store = InMemoryTaskStore()
    await store.submit("webhooks", "evt-2", {}, max_attempts=2)

    for _ in range(2):
        lease = await store.lease("webhooks", lease_seconds=10)
        assert lease is not None
        await store.fail(lease.task_id, lease.token, error="boom", retry_in_seconds=0)
        clock.advance(1)

    assert await store.lease("webhooks", lease_seconds=10) is None

    [dead] = await store.list_dead_letter("webhooks")
    assert dead.status is TaskStatus.DEAD_LETTER
    assert dead.attempts == 2
    assert dead.last_error == "boom"


@pytest.mark.asyncio
async def test_crashed_worker_redeliveries_also_exhaust_max_attempts(clock) -> None:
    """A task can dead-letter purely from repeated crashes, with no explicit failure."""
    store = InMemoryTaskStore()
    await store.submit("webhooks", "evt-3", {}, max_attempts=1)

    first = await store.lease("webhooks", lease_seconds=5)
    assert first is not None
    clock.advance(6)  # worker crashes and never acks or fails

    # The reclaim scan finds the expired lease, but the redelivery attempt
    # count already exceeds max_attempts, so the task dead-letters instead
    # of leasing again.
    assert await store.lease("webhooks", lease_seconds=5) is None

    [dead] = await store.list_dead_letter("webhooks")
    assert dead.id == first.task_id


@pytest.mark.asyncio
async def test_requeue_from_dead_letter_resets_attempts(clock) -> None:
    store = InMemoryTaskStore()
    await store.submit("webhooks", "evt-4", {}, max_attempts=1)

    lease = await store.lease("webhooks", lease_seconds=10)
    assert lease is not None
    await store.fail(
        lease.task_id,
        lease.token,
        error="permanent-looking, but an operator disagrees",
        retry_in_seconds=0,
    )

    requeued = await store.requeue_dead_letter(lease.task_id)
    assert requeued.status is TaskStatus.PENDING
    assert requeued.attempts == 0

    retried = await store.lease("webhooks", lease_seconds=10)
    assert retried is not None
    assert retried.attempt == 1
