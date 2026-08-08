from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

BatchHandler = Callable[[list[Any]], Awaitable[list[Any]]]


@dataclass(frozen=True, slots=True)
class ModelVersion:
    """A servable model version and the share of traffic it should receive.

    Weights are relative, not required to sum to 1.0 — a stable version at
    weight 9 and a canary at weight 1 route roughly 90/10 without needing
    every version's weight rebalanced whenever one changes.
    """

    version: str
    handler: BatchHandler
    weight: float = 1.0


@dataclass(slots=True)
class VersionMetrics:
    request_count: int = 0
    error_count: int = 0
    total_latency_ms: float = 0.0

    @property
    def error_rate(self) -> float:
        return self.error_count / self.request_count if self.request_count else 0.0

    @property
    def mean_latency_ms(self) -> float:
        return self.total_latency_ms / self.request_count if self.request_count else 0.0


@dataclass(frozen=True, slots=True)
class InferenceResult:
    version: str
    output: Any
    latency_ms: float


@dataclass(frozen=True, slots=True)
class BenchmarkReport:
    total_requests: int
    error_count: int
    duration_seconds: float
    throughput_rps: float
    p50_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    latencies_ms: tuple[float, ...] = field(repr=False)
