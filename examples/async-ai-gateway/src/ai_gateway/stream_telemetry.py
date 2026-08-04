from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass(slots=True)
class StreamTelemetry:
    first_token_ms: list[float] = field(default_factory=list)
    duration_ms: list[float] = field(default_factory=list)
    completed: int = 0
    disconnected: int = 0

    def record_first_token(self, started_at: float) -> None:
        self.first_token_ms.append((time.perf_counter() - started_at) * 1000)

    def record_completion(self, started_at: float) -> None:
        self.completed += 1
        self.duration_ms.append((time.perf_counter() - started_at) * 1000)

    def record_disconnect(self, started_at: float) -> None:
        self.disconnected += 1
        self.duration_ms.append((time.perf_counter() - started_at) * 1000)

    def snapshot(self) -> dict[str, object]:
        def percentiles(values: list[float]) -> dict[str, float]:
            ordered = sorted(values)
            if not ordered:
                return {"p50": 0.0, "p95": 0.0, "p99": 0.0}

            def pick(q: float) -> float:
                index = min(len(ordered) - 1, int((len(ordered) - 1) * q))
                return round(ordered[index], 2)

            return {"p50": pick(0.50), "p95": pick(0.95), "p99": pick(0.99)}

        return {
            "first_token_ms": percentiles(self.first_token_ms),
            "stream_duration_ms": percentiles(self.duration_ms),
            "completed_total": self.completed,
            "disconnected_total": self.disconnected,
        }
