"""Selection policies: given the capable models, which one.

Three policies, deliberately including the naive one. `CheapestCapable` is what most
systems actually do, and having it here means the measurement in `workload.py` can
compare against it rather than against a strawman nobody ships.
"""

from __future__ import annotations

from typing import Protocol

from model_router.errors import BudgetExceeded
from model_router.models import ModelSpec, RoutingDecision, Task


class RoutingPolicy(Protocol):
    """What every policy must answer: which of these, and why."""

    name: str

    def choose(self, task: Task, candidates: tuple[ModelSpec, ...]) -> RoutingDecision: ...


class CheapestCapable:
    """Always the cheapest model that supports the task class.

    The default most systems drift into. It is not wrong — it is unmeasured: it
    optimises the one number that is easy to see (spend) and ignores the one that is
    not (how often the answer was bad).
    """

    name = "cheapest-capable"

    def choose(self, task: Task, candidates: tuple[ModelSpec, ...]) -> RoutingDecision:
        model = candidates[0]  # registry returns cheapest-first
        return RoutingDecision(
            task_id=task.task_id,
            model=model.name,
            estimated_cost=task.cost_on(model),
            reason="cheapest model supporting this task class",
        )


class QualityFloor:
    """Cheapest model whose quality for this task class clears a floor.

    The floor is per-task-class, which is the point: 0.8 is a reasonable bar for
    extraction and a meaningless one for open-ended reasoning, where nothing available
    may clear it.
    """

    name = "quality-floor"

    def __init__(self, floor: float) -> None:
        self._floor = floor

    def choose(self, task: Task, candidates: tuple[ModelSpec, ...]) -> RoutingDecision:
        for model in candidates:  # cheapest-first
            if model.quality_for(task.task_class) >= self._floor:
                return RoutingDecision(
                    task_id=task.task_id,
                    model=model.name,
                    estimated_cost=task.cost_on(model),
                    reason=f"cheapest model at or above quality floor {self._floor}",
                )
        # Falling back to the best available is a decision, not an accident, and the
        # reason string says so — silently dropping below the floor is how a quality
        # bar becomes decorative.
        best = max(candidates, key=lambda m: m.quality_for(task.task_class))
        return RoutingDecision(
            task_id=task.task_id,
            model=best.name,
            estimated_cost=task.cost_on(best),
            reason=f"no model clears floor {self._floor}; using best available",
        )


class BudgetCapped:
    """Wraps another policy and refuses decisions above a per-task cost ceiling.

    Deliberately raises rather than silently downgrading. A budget that quietly picks
    a worse model is a quality regression with no alert attached; a budget that raises
    is a decision someone has to make.
    """

    def __init__(self, inner: RoutingPolicy, *, max_cost_per_task: float) -> None:
        self._inner = inner
        self._ceiling = max_cost_per_task
        self.name = f"budget-capped({inner.name})"

    def choose(self, task: Task, candidates: tuple[ModelSpec, ...]) -> RoutingDecision:
        decision = self._inner.choose(task, candidates)
        if decision.estimated_cost > self._ceiling:
            raise BudgetExceeded(
                f"{decision.model} would cost {decision.estimated_cost:.4f} "
                f"for {task.task_id}, ceiling is {self._ceiling:.4f}"
            )
        return decision
