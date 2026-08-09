from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager


class DrainManager:
    """Tracks active requests and supports bounded graceful shutdown."""

    def __init__(self) -> None:
        self._accepting = True
        self._active = 0
        self._condition = asyncio.Condition()

    @property
    def accepting(self) -> bool:
        return self._accepting

    @property
    def active_requests(self) -> int:
        return self._active

    @asynccontextmanager
    async def request(self) -> AsyncIterator[None]:
        async with self._condition:
            if not self._accepting:
                raise RuntimeError("Gateway is draining")
            self._active += 1
        try:
            yield
        finally:
            async with self._condition:
                self._active -= 1
                if self._active == 0:
                    self._condition.notify_all()

    async def drain(self, timeout_seconds: float = 30.0) -> bool:
        async with self._condition:
            self._accepting = False
            if self._active == 0:
                return True
            try:
                async with asyncio.timeout(timeout_seconds):
                    await self._condition.wait_for(lambda: self._active == 0)
                return True
            except TimeoutError:
                return False
