from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import TaskStatus


class TaskQueueError(Exception):
    """Base error for the durable task queue."""


class TaskNotFoundError(TaskQueueError):
    def __init__(self, task_id: str) -> None:
        super().__init__(f"task {task_id!r} not found")
        self.task_id = task_id


class TaskQueueStateError(TaskQueueError):
    def __init__(self, task_id: str, status: TaskStatus) -> None:
        super().__init__(
            f"task {task_id!r} is not eligible for this operation (status={status.value})"
        )
        self.task_id = task_id
        self.status = status


class LeaseExpiredError(TaskQueueError):
    """Raised when a worker acts on a task with a stale or wrong lease token.

    This is the queue's fencing mechanism: it stops a slow worker whose
    lease already expired (and was reclaimed by another worker) from
    corrupting state with a late ack, fail, or checkpoint.
    """

    def __init__(self, task_id: str) -> None:
        super().__init__(f"lease for task {task_id!r} is no longer valid")
        self.task_id = task_id
