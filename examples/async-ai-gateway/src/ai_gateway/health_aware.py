from __future__ import annotations

import time
from dataclasses import dataclass

from .models import AIProvider


@dataclass(slots=True)
class ProviderHealth:
    successes: int = 0
    failures: int = 0
    consecutive_failures: int = 0
    latency_ema_ms: float = 0.0
    ejected_until: float = 0.0

    @property
    def success_rate(self) -> float:
        total = self.successes + self.failures
        return self.successes / total if total else 1.0


class HealthAwareSelector:
    def __init__(
        self,
        providers: dict[str, AIProvider],
        *,
        failure_threshold: int = 3,
        ejection_seconds: float = 15.0,
        ema_alpha: float = 0.25,
    ) -> None:
        self._providers = providers
        self._health = {name: ProviderHealth() for name in providers}
        self._failure_threshold = failure_threshold
        self._ejection_seconds = ejection_seconds
        self._ema_alpha = ema_alpha

    def select(self, requested: str | None = None) -> AIProvider:
        if requested is not None:
            try:
                return self._providers[requested]
            except KeyError as exc:
                raise ValueError(f"Unknown provider: {requested}") from exc

        now = time.monotonic()
        candidates = [
            (name, provider)
            for name, provider in self._providers.items()
            if self._health[name].ejected_until <= now
        ]
        if not candidates:
            candidates = list(self._providers.items())

        def score(item: tuple[str, AIProvider]) -> tuple[float, float, int]:
            name, _ = item
            health = self._health[name]
            latency = health.latency_ema_ms or 1.0
            return (-health.success_rate, latency, health.consecutive_failures)

        name, provider = min(candidates, key=score)
        return provider

    def record_success(self, provider_name: str, latency_ms: float) -> None:
        health = self._health[provider_name]
        health.successes += 1
        health.consecutive_failures = 0
        if health.latency_ema_ms == 0:
            health.latency_ema_ms = latency_ms
        else:
            health.latency_ema_ms = (
                self._ema_alpha * latency_ms
                + (1 - self._ema_alpha) * health.latency_ema_ms
            )

    def record_failure(self, provider_name: str) -> None:
        health = self._health[provider_name]
        health.failures += 1
        health.consecutive_failures += 1
        if health.consecutive_failures >= self._failure_threshold:
            health.ejected_until = time.monotonic() + self._ejection_seconds

    def snapshot(self) -> dict[str, ProviderHealth]:
        return {name: ProviderHealth(**vars(health)) for name, health in self._health.items()}
