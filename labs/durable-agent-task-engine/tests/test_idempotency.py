from __future__ import annotations

import pytest

from task_queue.store import InMemoryTaskStore


@pytest.mark.asyncio
async def test_duplicate_idempotency_key_returns_same_task() -> None:
    store = InMemoryTaskStore()

    first = await store.submit("emails", "order-42-confirmation", {"to": "a@example.com"})
    second = await store.submit("emails", "order-42-confirmation", {"to": "a@example.com"})

    assert first.id == second.id


@pytest.mark.asyncio
async def test_duplicate_submission_does_not_create_extra_work() -> None:
    store = InMemoryTaskStore()

    await store.submit("emails", "order-42-confirmation", {})
    await store.submit("emails", "order-42-confirmation", {})

    lease = await store.lease("emails", lease_seconds=30)
    assert lease is not None
    await store.ack(lease.task_id, lease.token)

    assert await store.lease("emails", lease_seconds=30) is None


@pytest.mark.asyncio
async def test_different_idempotency_keys_create_distinct_tasks() -> None:
    store = InMemoryTaskStore()

    first = await store.submit("emails", "order-1", {})
    second = await store.submit("emails", "order-2", {})

    assert first.id != second.id
