"""Routing, and the escalation loop that sits on top of it."""

from __future__ import annotations

from dataclasses import dataclass

from model_router.execution import Attempt, SimulatedModel
from model_router.models import RoutingDecision, Task
from model_router.policy import RoutingPolicy
from model_router.registry import ModelRegistry


class ModelRouter:
    """Capability filter, then policy. In that order, always.

    The ordering is the design: cost is only allowed to choose among models that can
    actually do the job.
    """

    def __init__(self, registry: ModelRegistry, policy: RoutingPolicy) -> None:
        self._registry = registry
        self._policy = policy

    @property
    def policy_name(self) -> str:
        return self._policy.name

    def route(self, task: Task) -> RoutingDecision:
        return self._policy.choose(task, self._registry.capable_of(task.task_class))


@dataclass(frozen=True)
class EscalationOutcome:
    """What a task cost and whether it ended up right.

    `attempts` is the honest field: on escalation it holds two, and both were paid for.
    Reporting only the final attempt is how escalation appears cheaper than it is.
    """

    task_id: str
    attempts: tuple[Attempt, ...]
    escalated: bool

    @property
    def total_cost(self) -> float:
        return sum(a.cost for a in self.attempts)

    @property
    def correct(self) -> bool:
        return self.attempts[-1].correct


class EscalatingRouter:
    """Try the routed model; on low confidence, try the best model as well.

    Note what this does *not* do: it never un-pays for the first call. Escalation is
    strictly additive in cost, and only saves money overall when the cheap model is
    right often enough that the saved calls outweigh the doubled ones.
    """

    def __init__(
        self,
        router: ModelRouter,
        registry: ModelRegistry,
        executor: SimulatedModel,
        *,
        confidence_threshold: float = 0.5,
    ) -> None:
        self._router = router
        self._registry = registry
        self._executor = executor
        self._threshold = confidence_threshold

    def handle(self, task: Task) -> EscalationOutcome:
        first_choice = self._router.route(task)
        chosen = next(
            m for m in self._registry.all() if m.name == first_choice.model
        )
        attempts = [self._executor.run(task, chosen)]

        if attempts[0].confidence >= self._threshold:
            return EscalationOutcome(task.task_id, tuple(attempts), escalated=False)

        best = self._registry.best_for(task.task_class)
        if best.name == chosen.name:
            # Already on the best available model; escalating would re-run the same
            # thing and bill for it twice.
            return EscalationOutcome(task.task_id, tuple(attempts), escalated=False)

        attempts.append(self._executor.run(task, best))
        return EscalationOutcome(task.task_id, tuple(attempts), escalated=True)
