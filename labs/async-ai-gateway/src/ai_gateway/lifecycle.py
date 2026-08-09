from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager


class GatewayDrainingError(RuntimeError):
    pass


class DrainManager:
    """Coordinates request admission and bounded graceful shutdown."""

    def __init__(self) -> None:
        self._draining = False
        self._active = 0
        self._condition = asyncio.Condition()

    @property
    def draining(self) -> bool:
        return self._draining

    @property
    def active_requests(self) -> int:
        return self._active

    @asynccontextmanager
    async def admitted(self) -> AsyncIterator[None]:
        async with self._condition:
            if self._draining:
                raise GatewayDrainingError("Gateway is draining")
            self._active += 1
        try:
            yield
        finally:
            async with self._condition:
                self._active -= 1
                if self._active == 0:
                    self._condition.notify_all()

    async def begin_drain(self, timeout_seconds: float) -> bool:
        async with self._condition:
            self._draining = True
            if self._active == 0:
                return True
            try:
                async with asyncio.timeout(timeout_seconds):
                    await self._condition.wait_for(lambda: self._active == 0)
            except TimeoutError:
                return False
            return True
