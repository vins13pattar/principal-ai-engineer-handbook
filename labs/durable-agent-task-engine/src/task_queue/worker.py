from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol

from .backoff import exponential_backoff_seconds
from .errors import LeaseExpiredError
from .models import Lease, TaskStatus
from .store import InMemoryTaskStore

logger = logging.getLogger("task_queue.worker")


class TaskContext:
    """Handed to a task handler so it can checkpoint progress and heartbeat.

    Checkpointing lets a handler record resumable progress (for example,
    "rows 0-999 of 10,000 imported") so that if the worker crashes and the
    lease expires, the task that replaces it can pick up from that point
    instead of redoing completed work.
    """

    def __init__(self, store: InMemoryTaskStore, lease: Lease, *, lease_seconds: float) -> None:
        self._store = store
        self._lease = lease
        self._lease_seconds = lease_seconds

    @property
    def attempt(self) -> int:
        return self._lease.attempt

    @property
    def checkpoint(self) -> dict[str, Any] | None:
        return self._lease.checkpoint

    async def save_checkpoint(self, state: dict[str, Any]) -> None:
        await self._store.checkpoint(self._lease.task_id, self._lease.token, state)

    async def heartbeat(self) -> None:
        """Extend the lease. Call this during long-running work to signal liveness."""
        await self._store.heartbeat(
            self._lease.task_id, self._lease.token, lease_seconds=self._lease_seconds
        )


class TaskHandler(Protocol):
    async def __call__(self, payload: dict[str, Any], ctx: TaskContext) -> Any: ...


@dataclass(frozen=True, slots=True)
class WorkerResult:
    task_id: str
    outcome: str  # "succeeded" | "retrying" | "dead_letter"
    attempt: int
    error: str | None = None


class Worker:
    """Polls a queue and runs a handler with bounded concurrency.

    On handler success the task is acked. On handler exception, the task is
    failed with an exponential backoff delay; once attempts exhaust
    ``max_attempts`` the store moves it to the dead-letter state instead of
    retrying indefinitely.
    """

    def __init__(
        self,
        store: InMemoryTaskStore,
        queue: str,
        handler: TaskHandler,
        *,
        concurrency: int = 4,
        lease_seconds: float = 30.0,
        poll_interval: float = 0.02,
        backoff: Callable[[int], float] = exponential_backoff_seconds,
        on_result: Callable[[WorkerResult], Awaitable[None] | None] | None = None,
    ) -> None:
        self._store = store
        self._queue = queue
        self._handler = handler
        self._semaphore = asyncio.Semaphore(concurrency)
        self._lease_seconds = lease_seconds
        self._poll_interval = poll_interval
        self._backoff = backoff
        self._on_result = on_result

        self._stopping = asyncio.Event()
        self._in_flight: set[asyncio.Task[None]] = set()
        self.results: list[WorkerResult] = []

    async def run(self) -> None:
        while not self._stopping.is_set():
            await self._semaphore.acquire()
            if self._stopping.is_set():
                self._semaphore.release()
                return

            lease = await self._store.lease(self._queue, lease_seconds=self._lease_seconds)
            if lease is None:
                self._semaphore.release()
                try:
                    await asyncio.wait_for(self._stopping.wait(), timeout=self._poll_interval)
                except TimeoutError:
                    pass
                continue

            task = asyncio.create_task(self._process(lease))
            self._in_flight.add(task)
            task.add_done_callback(self._in_flight.discard)

    async def _process(self, lease: Lease) -> None:
        try:
            ctx = TaskContext(self._store, lease, lease_seconds=self._lease_seconds)
            try:
                await self._handler(lease.payload, ctx)
            except Exception as exc:  # noqa: BLE001 - handler errors drive retry policy
                await self._on_failure(lease, exc)
            else:
                await self._on_success(lease)
        finally:
            self._semaphore.release()

    async def _on_success(self, lease: Lease) -> None:
        try:
            await self._store.ack(lease.task_id, lease.token)
        except LeaseExpiredError:
            logger.warning(
                "lease expired before ack for task %s; another worker owns it", lease.task_id
            )
            return
        result = WorkerResult(task_id=lease.task_id, outcome="succeeded", attempt=lease.attempt)
        await self._emit(result)

    async def _on_failure(self, lease: Lease, exc: Exception) -> None:
        delay = self._backoff(lease.attempt)
        try:
            task = await self._store.fail(
                lease.task_id, lease.token, error=str(exc), retry_in_seconds=delay
            )
        except LeaseExpiredError:
            logger.warning(
                "lease expired before fail for task %s; another worker owns it", lease.task_id
            )
            return
        outcome = "dead_letter" if task.status is TaskStatus.DEAD_LETTER else "retrying"
        result = WorkerResult(
            task_id=lease.task_id, outcome=outcome, attempt=lease.attempt, error=str(exc)
        )
        await self._emit(result)

    async def _emit(self, result: WorkerResult) -> None:
        self.results.append(result)
        if self._on_result is not None:
            maybe_awaitable = self._on_result(result)
            if maybe_awaitable is not None:
                await maybe_awaitable

    async def shutdown(self, timeout_seconds: float = 30.0) -> bool:
        """Stop leasing new tasks and wait for in-flight work to finish."""
        self._stopping.set()
        if not self._in_flight:
            return True
        try:
            async with asyncio.timeout(timeout_seconds):
                await asyncio.gather(*self._in_flight, return_exceptions=True)
            return True
        except TimeoutError:
            return False
