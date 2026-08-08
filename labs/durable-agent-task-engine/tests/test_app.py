from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from task_queue.app import app, store


def test_submit_and_fetch_task() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/v1/queues/reports/tasks",
            json={"payload": {"report_id": "r-1"}, "max_attempts": 3},
            headers={"Idempotency-Key": "report-r-1"},
        )
        assert response.status_code == 201
        created = response.json()
        assert created["status"] == "pending"

        fetched = client.get(f"/v1/tasks/{created['id']}")
        assert fetched.status_code == 200
        assert fetched.json()["id"] == created["id"]


def test_duplicate_submission_is_idempotent() -> None:
    with TestClient(app) as client:
        headers = {"Idempotency-Key": "report-r-2"}
        first = client.post(
            "/v1/queues/reports/tasks", json={"payload": {}}, headers=headers
        ).json()
        second = client.post(
            "/v1/queues/reports/tasks", json={"payload": {}}, headers=headers
        ).json()
        assert first["id"] == second["id"]


def test_get_unknown_task_returns_404() -> None:
    with TestClient(app) as client:
        response = client.get("/v1/tasks/does-not-exist")
        assert response.status_code == 404


def test_dead_letter_listing_and_requeue() -> None:
    # A dedicated queue keeps this test's lease() call from racing other
    # tests' leftover pending tasks in the shared, module-level store.
    queue = "reports-dlq-test"
    with TestClient(app) as client:
        submitted = client.post(
            f"/v1/queues/{queue}/tasks",
            json={"payload": {}, "max_attempts": 1},
            headers={"Idempotency-Key": "report-r-3"},
        ).json()

    # Drive the task to dead-letter directly through the store, bypassing
    # HTTP since exhausting real retries would mean waiting on the demo
    # queue's background worker.
    async def exhaust() -> None:
        lease = await store.lease(queue, lease_seconds=10)
        assert lease is not None
        await store.fail(lease.task_id, lease.token, error="boom", retry_in_seconds=0)

    asyncio.run(exhaust())

    with TestClient(app) as client:
        dead_letter = client.get(f"/v1/queues/{queue}/dead-letter").json()
        assert any(t["id"] == submitted["id"] for t in dead_letter)

        requeue = client.post(f"/v1/tasks/{submitted['id']}/requeue")
        assert requeue.status_code == 200
        assert requeue.json()["status"] == "pending"

        conflict = client.post(f"/v1/tasks/{submitted['id']}/requeue")
        assert conflict.status_code == 409
