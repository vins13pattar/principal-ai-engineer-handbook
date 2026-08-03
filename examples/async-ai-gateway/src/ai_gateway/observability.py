from __future__ import annotations

import json
import logging
import time
from collections import Counter
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Iterator
from uuid import uuid4

request_id_var: ContextVar[str] = ContextVar("request_id", default="")
logger = logging.getLogger("ai_gateway")


def new_request_id(candidate: str | None = None) -> str:
    request_id = candidate.strip() if candidate else uuid4().hex
    request_id_var.set(request_id)
    return request_id


def log_event(event: str, **fields: object) -> None:
    payload = {
        "event": event,
        "request_id": request_id_var.get(),
        **fields,
    }
    logger.info(json.dumps(payload, default=str, separators=(",", ":")))


@dataclass
class REDMetrics:
    """Small in-process RED metrics collector for the lab.

    Production deployments should export counters and histograms through
    OpenTelemetry or Prometheus rather than aggregating them in process.
    """

    requests_total: Counter[str] = field(default_factory=Counter)
    errors_total: Counter[str] = field(default_factory=Counter)
    durations_ms: list[float] = field(default_factory=list)
    in_flight: int = 0

    @contextmanager
    def observe(self, operation: str) -> Iterator[None]:
        started = time.perf_counter()
        self.in_flight += 1
        self.requests_total[operation] += 1
        try:
            yield
        except Exception:
            self.errors_total[operation] += 1
            raise
        finally:
            self.in_flight -= 1
            self.durations_ms.append((time.perf_counter() - started) * 1000)

    def snapshot(self) -> dict[str, object]:
        durations = sorted(self.durations_ms)

        def percentile(value: float) -> float:
            if not durations:
                return 0.0
            index = min(len(durations) - 1, int((len(durations) - 1) * value))
            return round(durations[index], 2)

        return {
            "requests_total": dict(self.requests_total),
            "errors_total": dict(self.errors_total),
            "in_flight": self.in_flight,
            "latency_ms": {
                "p50": percentile(0.50),
                "p95": percentile(0.95),
                "p99": percentile(0.99),
            },
        }
