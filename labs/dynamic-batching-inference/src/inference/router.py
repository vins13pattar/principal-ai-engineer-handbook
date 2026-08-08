from __future__ import annotations

import random
import time
from typing import Any

from .batcher import DynamicBatcher
from .errors import NoServableVersionError, UnknownVersionError
from .models import InferenceResult, ModelVersion, VersionMetrics


class CanaryRouter:
    """Routes each request to a model version, weighted by traffic share.

    Each version gets its own batcher, so a canary can run a different
    batch size, wait time, or handler cost profile without affecting the
    stable version's behavior. Weights are relative: registering a stable
    version at weight 9 and a canary at weight 1 routes roughly 90/10.
    """

    def __init__(self) -> None:
        self._versions: dict[str, ModelVersion] = {}
        self._batchers: dict[str, DynamicBatcher] = {}
        self._metrics: dict[str, VersionMetrics] = {}

    def register(
        self,
        model_version: ModelVersion,
        *,
        max_batch_size: int = 8,
        max_wait_seconds: float = 0.02,
    ) -> DynamicBatcher:
        batcher = DynamicBatcher(
            model_version.handler,
            max_batch_size=max_batch_size,
            max_wait_seconds=max_wait_seconds,
        )
        self._versions[model_version.version] = model_version
        self._batchers[model_version.version] = batcher
        self._metrics[model_version.version] = VersionMetrics()
        return batcher

    def batchers(self) -> list[DynamicBatcher]:
        return list(self._batchers.values())

    def choose_version(self, *, rng: random.Random | None = None) -> str:
        servable = [v for v in self._versions.values() if v.weight > 0]
        if not servable:
            raise NoServableVersionError()

        chooser = rng or random
        total_weight = sum(v.weight for v in servable)
        pick = chooser.uniform(0, total_weight)
        cumulative = 0.0
        for candidate in servable:
            cumulative += candidate.weight
            if pick <= cumulative:
                return candidate.version
        return servable[-1].version  # floating-point rounding fallback

    async def infer(
        self, payload: Any, *, version: str | None = None, rng: random.Random | None = None
    ) -> InferenceResult:
        target = version or self.choose_version(rng=rng)
        if target not in self._versions:
            raise UnknownVersionError(target)

        metrics = self._metrics[target]
        started = time.monotonic()
        try:
            output = await self._batchers[target].submit(payload)
        except Exception:
            metrics.request_count += 1
            metrics.error_count += 1
            raise

        latency_ms = (time.monotonic() - started) * 1000
        metrics.request_count += 1
        metrics.total_latency_ms += latency_ms
        return InferenceResult(version=target, output=output, latency_ms=latency_ms)

    def metrics(self, version: str) -> VersionMetrics:
        if version not in self._versions:
            raise UnknownVersionError(version)
        return self._metrics[version]

    def list_versions(self) -> list[ModelVersion]:
        return list(self._versions.values())

    def promote(self, version: str) -> None:
        """Route all traffic to this version; every other version drops to zero weight."""
        if version not in self._versions:
            raise UnknownVersionError(version)
        for existing in list(self._versions.values()):
            self._set_weight(existing.version, 1.0 if existing.version == version else 0.0)

    def rollback(self, version: str) -> None:
        """Drop this version's traffic weight to zero without affecting other versions."""
        if version not in self._versions:
            raise UnknownVersionError(version)
        self._set_weight(version, 0.0)

    def _set_weight(self, version: str, weight: float) -> None:
        existing = self._versions[version]
        self._versions[version] = ModelVersion(
            version=existing.version, handler=existing.handler, weight=weight
        )
