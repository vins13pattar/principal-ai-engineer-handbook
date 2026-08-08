from __future__ import annotations

import time as time_module
from collections.abc import Iterator

import pytest


class FakeClock:
    """A controllable stand-in for ``time.monotonic``, for deterministic rate-limit tests."""

    def __init__(self, start: float = 1_000.0) -> None:
        self._now = start

    def __call__(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeClock]:
    fake = FakeClock()
    monkeypatch.setattr(time_module, "monotonic", fake)
    yield fake
