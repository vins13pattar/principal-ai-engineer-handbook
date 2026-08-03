from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Mapping

from .models import AIProvider


@dataclass
class ProviderHealth:
    successes: int = 0
    failures: int = 0
    consecutive_failures: int = 0
    latency_ema_ms: float = 0.0
    ejected_until: float = 0.0

    @property
    def success_rate(self) -> float:
        total = self.successes + self.failures
        return 1.0 if total == 0 else self.successes / total

    def score(self, now: float) -> float:
        if self.ejected_until > now:
            return float("-inf")
        latency_penalty = self.latency_ema_ms / 1000
        failure_penalty = self.consecutive_failures * 0.25
        return self.success_rate - latency_penalty - failure_penalty


@dataclass
class HealthAwareRouter:
    providers: Mapping[str, AIProvider]
    failure_ejection_threshold: int = 3
    ejection_seconds: float = 30.0
    alpha: float = 0.2
    health: dict[str, ProviderHealth] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.providers:
            raise ValueError("At least one provider is required")
        for name in self.providers:
            self.health.setdefault(name, ProviderHealth())

    def select(self) -> tuple[str, AIProvider]:
        now = time.monotonic()
        name = max(self.providers, key=lambda item: self.health[item].score(now))
        if self.health[name].score(now) == float("-inf"):
            raise RuntimeError("No healthy providers are available")
        return name, self.providers[name]

    def record_success(self, name: str, latency_ms: float) -> None:
        state = self.health[name]
        state.successes += 1
        state.consecutive_failures = 0
        state.ejected_until = 0.0
        state.latency_ema_ms = (
            latency_ms
            if state.latency_ema_ms == 0
            else self.alpha * latency_ms + (1 - self.alpha) * state.latency_ema_ms
        )

    def record_failure(self, name: str) -> None:
        state = self.health[name]
        state.failures += 1
        state.consecutive_failures += 1
        if state.consecutive_failures >= self.failure_ejection_threshold:
            state.ejected_until = time.monotonic() + self.ejection_seconds

    def snapshot(self) -> dict[str, dict[str, float | int]]:
        return {
            name: {
                "successes": item.successes,
                "failures": item.failures,
                "consecutive_failures": item.consecutive_failures,
                "success_rate": round(item.success_rate, 4),
                "latency_ema_ms": round(item.latency_ema_ms, 2),
                "ejected_for_seconds": round(max(0.0, item.ejected_until - time.monotonic()), 2),
            }
            for name, item in self.health.items()
        }
