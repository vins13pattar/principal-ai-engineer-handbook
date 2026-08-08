from __future__ import annotations

import asyncio
import time
from typing import Any

from .errors import LeaseExpiredError, TaskNotFoundError, TaskQueueStateError
from .models import Lease, Task, TaskStatus, new_id, new_lease_token


class InMemoryTaskStore:
    """A single-process durable task store.

    Every state transition happens under one lock and is expressed as a
    pure in-memory mutation, so it doubles as a specification for what a
    production store (Postgres `SELECT ... FOR UPDATE SKIP LOCKED`, or a
    Redis Lua script) has to guarantee atomically:

    - idempotent submission keyed by ``(queue, idempotency_key)``;
    - exactly one worker holds a valid lease at a time;
    - a lease that is never acked or failed becomes visible again after
      its visibility timeout, without an external supervisor;
    - stale acks/fails/checkpoints from an expired lease are rejected.
    """

    def __init__(self) -> None:
        self._tasks: dict[str, Task] = {}
        self._idempotency_index: dict[tuple[str, str], str] = {}
        self._lock = asyncio.Lock()

    async def submit(
        self,
        queue: str,
        idempotency_key: str,
        payload: dict[str, Any],
        *,
        max_attempts: int = 5,
    ) -> Task:
        async with self._lock:
            index_key = (queue, idempotency_key)
            existing_id = self._idempotency_index.get(index_key)
            if existing_id is not None:
                return self._tasks[existing_id]

            task = Task(
                id=new_id(),
                queue=queue,
                idempotency_key=idempotency_key,
                payload=payload,
                max_attempts=max_attempts,
            )
            self._tasks[task.id] = task
            self._idempotency_index[index_key] = task.id
            return task

    async def lease(self, queue: str, *, lease_seconds: float) -> Lease | None:
        now = time.monotonic()
        async with self._lock:
            self._reclaim_expired_locked(queue, now)

            candidates = sorted(
                (
                    t
                    for t in self._tasks.values()
                    if t.queue == queue and t.status is TaskStatus.PENDING and t.available_at <= now
                ),
                key=lambda t: t.available_at,
            )
            for task in candidates:
                task.attempts += 1
                if task.attempts > task.max_attempts:
                    task.status = TaskStatus.DEAD_LETTER
                    task.last_error = task.last_error or "max delivery attempts exceeded"
                    task.touch()
                    continue

                task.status = TaskStatus.LEASED
                task.lease_token = new_lease_token()
                task.leased_until = now + lease_seconds
                task.touch()
                return Lease(
                    task_id=task.id,
                    token=task.lease_token,
                    queue=task.queue,
                    attempt=task.attempts,
                    payload=task.payload,
                    checkpoint=task.checkpoint,
                )
            return None

    def _reclaim_expired_locked(self, queue: str, now: float) -> None:
        for task in self._tasks.values():
            if (
                task.queue == queue
                and task.status is TaskStatus.LEASED
                and task.leased_until is not None
                and task.leased_until <= now
            ):
                # The worker holding this lease never acked, failed, or
                # heartbeated in time -- treat it as crashed and make the
                # task visible again. The checkpoint survives so a new
                # worker can resume instead of restarting from scratch.
                task.status = TaskStatus.PENDING
                task.available_at = now
                task.lease_token = None
                task.leased_until = None
                task.touch()

    async def heartbeat(self, task_id: str, lease_token: str, *, lease_seconds: float) -> None:
        async with self._lock:
            task = self._require_leased(task_id, lease_token)
            task.leased_until = time.monotonic() + lease_seconds
            task.touch()

    async def checkpoint(self, task_id: str, lease_token: str, state: dict[str, Any]) -> None:
        async with self._lock:
            task = self._require_leased(task_id, lease_token)
            task.checkpoint = {**(task.checkpoint or {}), **state}
            task.touch()

    async def ack(self, task_id: str, lease_token: str) -> Task:
        async with self._lock:
            task = self._require_leased(task_id, lease_token)
            task.status = TaskStatus.SUCCEEDED
            task.lease_token = None
            task.leased_until = None
            task.touch()
            return task

    async def fail(
        self,
        task_id: str,
        lease_token: str,
        *,
        error: str,
        retry_in_seconds: float,
    ) -> Task:
        async with self._lock:
            task = self._require_leased(task_id, lease_token)
            task.last_error = error
            task.lease_token = None
            task.leased_until = None

            if task.attempts >= task.max_attempts:
                task.status = TaskStatus.DEAD_LETTER
            else:
                task.status = TaskStatus.PENDING
                task.available_at = time.monotonic() + retry_in_seconds
            task.touch()
            return task

    async def get(self, task_id: str) -> Task:
        async with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise TaskNotFoundError(task_id)
            return task

    async def list_dead_letter(self, queue: str) -> list[Task]:
        async with self._lock:
            return [
                t
                for t in self._tasks.values()
                if t.queue == queue and t.status is TaskStatus.DEAD_LETTER
            ]

    async def requeue_dead_letter(self, task_id: str, *, reset_attempts: bool = True) -> Task:
        async with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise TaskNotFoundError(task_id)
            if task.status is not TaskStatus.DEAD_LETTER:
                raise TaskQueueStateError(task_id, task.status)

            task.status = TaskStatus.PENDING
            task.available_at = time.monotonic()
            if reset_attempts:
                task.attempts = 0
            task.touch()
            return task

    def _require_leased(self, task_id: str, lease_token: str) -> Task:
        task = self._tasks.get(task_id)
        if task is None:
            raise TaskNotFoundError(task_id)
        if task.status is not TaskStatus.LEASED or task.lease_token != lease_token:
            raise LeaseExpiredError(task_id)
        return task
