from __future__ import annotations

import os

from locust import HttpUser, between, task

TOKEN = os.getenv("LOAD_TEST_TOKEN", "")


class GatewayUser(HttpUser):
    wait_time = between(0.2, 1.0)

    def on_start(self) -> None:
        self.headers = {
            "authorization": f"Bearer {TOKEN}",
            "content-type": "application/json",
        }

    @task(4)
    def generate(self) -> None:
        with self.client.post(
            "/v1/generate",
            headers=self.headers,
            json={"prompt": "Explain bounded concurrency", "timeout_seconds": 10},
            catch_response=True,
            name="POST /v1/generate",
        ) as response:
            if response.status_code not in {200, 429, 503}:
                response.failure(f"unexpected status {response.status_code}")

    @task(1)
    def readiness(self) -> None:
        self.client.get("/health/ready", name="GET /health/ready")
