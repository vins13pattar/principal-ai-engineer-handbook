from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


def now() -> float:
    """The queue's clock, read through one indirection.

    Every other reference to the clock -- ``touch`` below, and all four call
    sites in ``store`` -- looks ``time.monotonic`` up on the module at the
    moment it is called, so a test that replaces it is obeyed. A
    ``default_factory`` is different: it captures the function *object* when
    the class body executes, which is import time, and keeps calling the
    original no matter what is patched afterwards.

    The consequence was a suite that passed on a freshly booted machine and
    failed 11 of 26 on one with real uptime: new tasks got a true monotonic
    reading -- 2.9 million on a 43-day host -- while the store compared it
    against a fake clock starting at 1,000, so nothing was ever visible enough
    to lease. Routing the defaults through this function makes them resolve at
    call time like everything else.
    """
    return time.monotonic()


class TaskStatus(StrEnum):
    PENDING = "pending"
    LEASED = "leased"
    SUCCEEDED = "succeeded"
    DEAD_LETTER = "dead_letter"


@dataclass(slots=True)
class Task:
    """A durable unit of work.

    ``available_at`` is the visibility timestamp: the task is only eligible
    for leasing once ``time.monotonic() >= available_at``. Leasing moves it
    forward to ``leased_until`` so a crashed worker's task becomes visible
    again without any external coordinator.
    """

    id: str
    queue: str
    idempotency_key: str
    payload: dict[str, Any]
    max_attempts: int
    status: TaskStatus = TaskStatus.PENDING
    attempts: int = 0
    available_at: float = field(default_factory=now)
    lease_token: str | None = None
    leased_until: float | None = None
    checkpoint: dict[str, Any] | None = None
    last_error: str | None = None
    created_at: float = field(default_factory=now)
    updated_at: float = field(default_factory=now)

    def touch(self) -> None:
        self.updated_at = now()


@dataclass(frozen=True, slots=True)
class Lease:
    """A worker's temporary ownership of a task."""

    task_id: str
    token: str
    queue: str
    attempt: int
    payload: dict[str, Any]
    checkpoint: dict[str, Any] | None


def new_id() -> str:
    return uuid.uuid4().hex


def new_lease_token() -> str:
    return uuid.uuid4().hex
