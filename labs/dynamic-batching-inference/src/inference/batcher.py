from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from .errors import BatcherClosedError
from .models import BatchHandler

DEFAULT_MAX_BATCH_SIZE = 8
DEFAULT_MAX_WAIT_SECONDS = 0.02


@dataclass(slots=True)
class _Pending:
    payload: Any
    future: asyncio.Future[Any]


class DynamicBatcher:
    """Groups concurrent requests into batches, bounded by size or wait time.

    A request is held only until the batch fills up or ``max_wait_seconds``
    elapses, whichever comes first: the same trade-off every dynamic
    batching inference server makes, a little added latency per request in
    exchange for far fewer, larger calls to the model.
    """

    def __init__(
        self,
        handler: BatchHandler,
        *,
        max_batch_size: int = DEFAULT_MAX_BATCH_SIZE,
        max_wait_seconds: float = DEFAULT_MAX_WAIT_SECONDS,
    ) -> None:
        self._handler = handler
        self._max_batch_size = max_batch_size
        self._max_wait_seconds = max_wait_seconds
        self._pending: list[_Pending] = []
        self._lock = asyncio.Lock()
        self._batch_full = asyncio.Event()
        self._stopping = False
        self.batches_processed = 0

    async def submit(self, payload: Any) -> Any:
        if self._stopping:
            raise BatcherClosedError()
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        async with self._lock:
            self._pending.append(_Pending(payload, future))
            if len(self._pending) >= self._max_batch_size:
                self._batch_full.set()
        return await future

    async def run(self) -> None:
        """The background loop that owns flushing. Run this as a task."""
        while not self._stopping:
            try:
                async with asyncio.timeout(self._max_wait_seconds):
                    await self._batch_full.wait()
            except TimeoutError:
                pass
            await self._flush()

    async def _flush(self) -> None:
        async with self._lock:
            batch = self._pending
            self._pending = []
            self._batch_full.clear()
        if not batch:
            return

        self.batches_processed += 1
        payloads = [item.payload for item in batch]
        try:
            outputs = await self._handler(payloads)
        except Exception as exc:  # noqa: BLE001 - every waiter must hear about it, not just crash the loop
            for item in batch:
                if not item.future.done():
                    item.future.set_exception(exc)
            return

        for item, output in zip(batch, outputs, strict=True):
            if not item.future.done():
                item.future.set_result(output)

    async def shutdown(self) -> None:
        """Stop accepting new requests and flush whatever is still pending."""
        self._stopping = True
        self._batch_full.set()
        await self._flush()
