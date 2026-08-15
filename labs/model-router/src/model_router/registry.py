"""Capability filtering: which models may serve a task at all.

This is the step that has to happen before cost is considered. Sorting every model by
price and taking the cheapest is how a classification model ends up being asked to
write code — cheap, fast, and wrong.
"""

from __future__ import annotations

from model_router.errors import NoCapableModel
from model_router.models import ModelSpec, TaskClass


class ModelRegistry:
    """The set of models available to route to."""

    def __init__(self, models: list[ModelSpec]) -> None:
        if not models:
            raise ValueError("a registry with no models cannot route anything")
        self._models = tuple(models)

    def all(self) -> tuple[ModelSpec, ...]:
        return self._models

    def capable_of(self, task_class: TaskClass) -> tuple[ModelSpec, ...]:
        """Every model that declares support, cheapest first.

        Ties break on name rather than registration order, so routing is reproducible
        across runs — a router whose choice depends on dict ordering produces cost
        reports nobody can reconcile.
        """
        capable = [m for m in self._models if m.can_serve(task_class)]
        if not capable:
            raise NoCapableModel(f"no model supports {task_class!r}")
        return tuple(sorted(capable, key=lambda m: (m.cost_per_1k_tokens, m.name)))

    def best_for(self, task_class: TaskClass) -> ModelSpec:
        """Highest quality for this task class, ties broken by cost then name."""
        return max(
            self.capable_of(task_class),
            key=lambda m: (m.quality_for(task_class), -m.cost_per_1k_tokens, m.name),
        )
