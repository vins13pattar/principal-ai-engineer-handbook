from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from .models import Task, TaskStatus


class SubmitTaskRequest(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)
    max_attempts: int = Field(default=5, ge=1, le=50)


class TaskResponse(BaseModel):
    id: str
    queue: str
    status: TaskStatus
    attempts: int
    max_attempts: int
    last_error: str | None
    checkpoint: dict[str, Any] | None

    @classmethod
    def from_task(cls, task: Task) -> TaskResponse:
        return cls(
            id=task.id,
            queue=task.queue,
            status=task.status,
            attempts=task.attempts,
            max_attempts=task.max_attempts,
            last_error=task.last_error,
            checkpoint=task.checkpoint,
        )
