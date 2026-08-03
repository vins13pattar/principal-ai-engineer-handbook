from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from enum import StrEnum


class CircuitState(StrEnum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpenError(RuntimeError):
    pass


@dataclass
class CircuitBreaker:
    failure_threshold: int = 3
    recovery_timeout_seconds: float = 10.0

    def __post_init__(self) -> None:
        self._state = CircuitState.CLOSED
        self._failures = 0
        self._opened_at = 0.0
        self._probe_lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        if self._state is CircuitState.OPEN:
            if time.monotonic() - self._opened_at >= self.recovery_timeout_seconds:
                return CircuitState.HALF_OPEN
        return self._state

    async def allow(self) -> None:
        state = self.state
        if state is CircuitState.OPEN:
            raise CircuitOpenError("provider circuit is open")
        if state is CircuitState.HALF_OPEN:
            if self._probe_lock.locked():
                raise CircuitOpenError("provider circuit is probing recovery")
            await self._probe_lock.acquire()
            self._state = CircuitState.HALF_OPEN

    def record_success(self) -> None:
        self._failures = 0
        self._state = CircuitState.CLOSED
        if self._probe_lock.locked():
            self._probe_lock.release()

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.failure_threshold or self._state is CircuitState.HALF_OPEN:
            self._state = CircuitState.OPEN
            self._opened_at = time.monotonic()
        if self._probe_lock.locked():
            self._probe_lock.release()
