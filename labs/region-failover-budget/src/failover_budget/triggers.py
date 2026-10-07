"""Failover triggers: the policies that decide a region is down.

A trigger sees one observation per probe interval. ``True`` is a healthy probe,
``False`` an unhealthy one, and ``None`` a probe that was due and never arrived.
What a trigger does with ``None`` is the difference between failing over when a
region goes dark and waiting on it forever.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Protocol


class Trigger(Protocol):
    """Decides, one observation at a time, whether to fail over."""

    def observe(self, now: float, healthy: bool | None) -> bool:
        """Record an observation at ``now``; return True if the trigger fires."""
        ...

    def reset(self) -> None:
        """Forget all history, as a controller does when it restarts or after a failover."""
        ...


@dataclass
class WindowAllUnhealthy:
    """Module 11's ``FailoverController``, behaviour for behaviour.

    Fires when every check recorded inside the last ``window`` seconds is
    unhealthy, and never when the window holds no checks at all. With
    ``silence_is_failure`` a probe that never arrived is recorded as unhealthy
    instead of being skipped.
    """

    window: float
    silence_is_failure: bool = False
    _checks: deque[tuple[float, bool]] = field(default_factory=deque, repr=False)

    def observe(self, now: float, healthy: bool | None) -> bool:
        if healthy is None:
            if not self.silence_is_failure:
                return self._evaluate(now)
            healthy = False
        self._checks.append((now, healthy))
        return self._evaluate(now)

    def _evaluate(self, now: float) -> bool:
        window_start = now - self.window
        while self._checks and self._checks[0][0] < window_start:
            self._checks.popleft()
        if not self._checks:
            return False
        return all(not ok for _, ok in self._checks)

    def reset(self) -> None:
        self._checks.clear()

    @property
    def label(self) -> str:
        rule = ", silence=fail" if self.silence_is_failure else ""
        return f"window-all-unhealthy({self.window:g}s{rule})"


@dataclass
class ConsecutiveFailures:
    """Fires after ``n`` consecutive failed probes; a healthy probe resets the count."""

    n: int
    silence_is_failure: bool = False
    _failures: int = field(default=0, repr=False)

    def observe(self, now: float, healthy: bool | None) -> bool:
        if healthy is None:
            if not self.silence_is_failure:
                return False
            healthy = False
        self._failures = 0 if healthy else self._failures + 1
        return self._failures >= self.n

    def reset(self) -> None:
        self._failures = 0

    @property
    def label(self) -> str:
        rule = ", silence=fail" if self.silence_is_failure else ""
        return f"consecutive({self.n}{rule})"
