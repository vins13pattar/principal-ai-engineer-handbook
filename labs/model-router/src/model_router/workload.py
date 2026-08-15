"""Runs a workload under a strategy and reports what it cost and how often it was right.

The comparison this lab exists for. A routing strategy is not better because it sounds
better; it is better because, on the same workload, it moved cost or accuracy in a
direction you wanted and you can show the numbers.
"""

from __future__ import annotations

from dataclasses import dataclass

from model_router.execution import SimulatedModel
from model_router.models import Task
from model_router.registry import ModelRegistry
from model_router.router import EscalatingRouter, ModelRouter


@dataclass(frozen=True)
class WorkloadResult:
    """Cost and correctness for one strategy over one workload."""

    strategy: str
    total_cost: float
    correct: int
    total: int
    escalations: int

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 0.0

    @property
    def cost_per_correct_answer(self) -> float:
        """Total spend divided by correct answers.

        Reported because it is the metric people reach for, and kept because it is a
        trap. Whenever the cheap baseline is already decent, this number gets *worse*
        under escalation even when escalation is obviously the right call — the
        baseline's many cheap correct answers dominate the average and the handful of
        expensive rescued ones cannot move it. See
        `marginal_cost_per_additional_correct`, which is the number that decides.
        """
        return self.total_cost / self.correct if self.correct else float("inf")

    def marginal_cost_per_additional_correct(self, baseline: WorkloadResult) -> float:
        """What each answer this strategy *rescued* cost, over the baseline.

        The honest framing. Escalation does not make answers cheaper; it buys
        additional correct ones at a price. This is that price, and whether it is worth
        paying is a product decision — what a wrong answer costs you — not something a
        router can decide.
        """
        gained = self.correct - baseline.correct
        if gained <= 0:
            return float("inf")
        return (self.total_cost - baseline.total_cost) / gained


def run_direct(
    tasks: list[Task], router: ModelRouter, registry: ModelRegistry, executor: SimulatedModel
) -> WorkloadResult:
    """One call per task, no escalation."""
    cost = 0.0
    correct = 0
    for task in tasks:
        decision = router.route(task)
        spec = next(m for m in registry.all() if m.name == decision.model)
        attempt = executor.run(task, spec)
        cost += attempt.cost
        correct += int(attempt.correct)
    return WorkloadResult(
        strategy=router.policy_name,
        total_cost=cost,
        correct=correct,
        total=len(tasks),
        escalations=0,
    )


def run_escalating(tasks: list[Task], router: EscalatingRouter, *, label: str) -> WorkloadResult:
    """Cheap model first, escalate on low confidence — paying for both."""
    cost = 0.0
    correct = 0
    escalations = 0
    for task in tasks:
        outcome = router.handle(task)
        cost += outcome.total_cost
        correct += int(outcome.correct)
        escalations += int(outcome.escalated)
    return WorkloadResult(
        strategy=label,
        total_cost=cost,
        correct=correct,
        total=len(tasks),
        escalations=escalations,
    )
