from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException

from .api_models import SubmitTaskRequest, TaskResponse
from .demo import FlakyDemoHandler
from .errors import TaskNotFoundError, TaskQueueStateError
from .store import InMemoryTaskStore
from .worker import Worker

logging.basicConfig(level=logging.INFO, format="%(message)s")

DEMO_QUEUE = "demo"

store = InMemoryTaskStore()
worker = Worker(store, DEMO_QUEUE, FlakyDemoHandler(), concurrency=4, lease_seconds=5.0)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    worker_task = asyncio.create_task(worker.run())
    yield
    await worker.shutdown(timeout_seconds=10.0)
    worker_task.cancel()


app = FastAPI(title="Durable Agent Task Queue Lab", version="0.3.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/queues/{queue}/tasks", response_model=TaskResponse, status_code=201)
async def submit_task(
    queue: str,
    request: SubmitTaskRequest,
    idempotency_key: str = Header(alias="Idempotency-Key"),
) -> TaskResponse:
    """Submit a task.

    Clients must send a stable ``Idempotency-Key`` (for example, one
    generated per logical operation and reused across HTTP retries).
    Submitting the same key twice returns the original task rather than
    creating a duplicate.
    """
    task = await store.submit(
        queue,
        idempotency_key,
        request.payload,
        max_attempts=request.max_attempts,
    )
    return TaskResponse.from_task(task)


@app.get("/v1/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str) -> TaskResponse:
    try:
        task = await store.get(task_id)
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return TaskResponse.from_task(task)


@app.get("/v1/queues/{queue}/dead-letter", response_model=list[TaskResponse])
async def list_dead_letter(queue: str) -> list[TaskResponse]:
    tasks = await store.list_dead_letter(queue)
    return [TaskResponse.from_task(t) for t in tasks]


@app.post("/v1/tasks/{task_id}/requeue", response_model=TaskResponse)
async def requeue_dead_letter(task_id: str) -> TaskResponse:
    try:
        task = await store.requeue_dead_letter(task_id)
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except TaskQueueStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return TaskResponse.from_task(task)
