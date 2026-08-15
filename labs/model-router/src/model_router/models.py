"""The shapes a routing decision is made from.

Costs and quality scores here are lab fixtures, not benchmark numbers. They are
plausible *relative* orderings — a small model is cheaper and less accurate than a
large one — and nothing in the tests depends on their absolute values. Quoting them
as real pricing would be inventing a benchmark, which is the thing this handbook's
reviewer prompt exists to catch.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class TaskClass(StrEnum):
    """What kind of work a request is, which is what capability routing keys on."""

    CLASSIFY = "classify"
    EXTRACT = "extract"
    SUMMARISE = "summarise"
    REASON = "reason"
    CODE = "code"


@dataclass(frozen=True)
class ModelSpec:
    """A candidate the router may choose.

    `quality` is a per-task-class expectation, not a single scalar: a small model can
    be excellent at classification and useless at multi-step reasoning, and collapsing
    that into one number is how "just use the cheap one" becomes a bad default.
    """

    name: str
    cost_per_1k_tokens: float
    supports: frozenset[TaskClass]
    quality: dict[TaskClass, float] = field(default_factory=dict)

    def can_serve(self, task_class: TaskClass) -> bool:
        return task_class in self.supports

    def quality_for(self, task_class: TaskClass) -> float:
        """Absent means unsupported, which scores zero rather than defaulting high."""
        return self.quality.get(task_class, 0.0)


@dataclass(frozen=True)
class Task:
    """One unit of work to route."""

    task_id: str
    task_class: TaskClass
    estimated_tokens: int = 1_000

    def cost_on(self, model: ModelSpec) -> float:
        return model.cost_per_1k_tokens * (self.estimated_tokens / 1_000)


@dataclass(frozen=True)
class RoutingDecision:
    """Which model, why, and what it is expected to cost.

    `reason` exists so a routing decision is explainable after the fact. A router that
    cannot say why it chose a model is one you cannot debug when it starts choosing
    badly — and cost regressions are exactly the kind of thing nobody notices for a
    month.
    """

    task_id: str
    model: str
    estimated_cost: float
    reason: str
    escalated_from: str | None = None
