from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


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
    available_at: float = field(default_factory=time.monotonic)
    lease_token: str | None = None
    leased_until: float | None = None
    checkpoint: dict[str, Any] | None = None
    last_error: str | None = None
    created_at: float = field(default_factory=time.monotonic)
    updated_at: float = field(default_factory=time.monotonic)

    def touch(self) -> None:
        self.updated_at = time.monotonic()


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
