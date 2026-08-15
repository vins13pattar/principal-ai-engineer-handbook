"""Capability filtering and policy selection — the ordering the router is built on."""

from __future__ import annotations

import pytest

from model_router.demo import LARGE, MID, SMALL, build_registry
from model_router.errors import BudgetExceeded, NoCapableModel
from model_router.models import ModelSpec, Task, TaskClass
from model_router.policy import BudgetCapped, CheapestCapable, QualityFloor
from model_router.registry import ModelRegistry
from model_router.router import ModelRouter


def test_capability_filtering_happens_before_cost() -> None:
    """The whole design in one assertion.

    `small` is the cheapest model in the fleet and cannot write code. A router that
    sorted by price first would pick it and be cheap, fast, and wrong.
    """
    router = ModelRouter(build_registry(), CheapestCapable())
    decision = router.route(Task("t-1", TaskClass.CODE))

    assert decision.model == LARGE.name
    assert SMALL.cost_per_1k_tokens < LARGE.cost_per_1k_tokens


def test_an_unsupported_task_class_raises_rather_than_guessing() -> None:
    registry = ModelRegistry([SMALL])
    router = ModelRouter(registry, CheapestCapable())

    with pytest.raises(NoCapableModel, match="code"):
        router.route(Task("t-1", TaskClass.CODE))


def test_cheapest_capable_picks_the_cheapest_that_can_serve() -> None:
    router = ModelRouter(build_registry(), CheapestCapable())

    assert router.route(Task("t-1", TaskClass.CLASSIFY)).model == SMALL.name
    assert router.route(Task("t-2", TaskClass.REASON)).model == MID.name


def test_quality_floor_trades_up_only_as_far_as_the_floor_requires() -> None:
    """Cheapest model *clearing the bar*, not the best model available."""
    router = ModelRouter(build_registry(), QualityFloor(0.90))

    # small extracts at 0.80, mid at 0.91 — mid clears it, so large is not needed.
    assert router.route(Task("t-1", TaskClass.EXTRACT)).model == MID.name


def test_an_unreachable_floor_falls_back_visibly_rather_than_silently() -> None:
    """A quality bar nothing clears must say so, or it is decoration.

    Nothing in the fleet reasons at 0.99. The router still returns a decision — you
    cannot serve nothing — but the reason string records that the floor was not met,
    so the fallback is auditable instead of invisible.
    """
    router = ModelRouter(build_registry(), QualityFloor(0.99))
    decision = router.route(Task("t-1", TaskClass.REASON))

    assert decision.model == LARGE.name
    assert "no model clears floor" in decision.reason


def test_budget_cap_raises_instead_of_quietly_downgrading() -> None:
    """A budget that silently picks a worse model is a quality regression with no alarm."""
    router = ModelRouter(
        build_registry(), BudgetCapped(CheapestCapable(), max_cost_per_task=0.001)
    )

    # CODE forces `large`, whose cost for a 1k-token task exceeds the ceiling.
    with pytest.raises(BudgetExceeded, match="ceiling"):
        router.route(Task("t-1", TaskClass.CODE))


def test_routing_is_reproducible_when_two_models_tie_on_cost() -> None:
    """Ties break on name, not registration order or dict iteration.

    Without this, the same workload produces different cost reports on different runs
    and nobody can reconcile the numbers.
    """
    twin_b = ModelSpec("b-model", 0.001, frozenset({TaskClass.CLASSIFY}), {TaskClass.CLASSIFY: 0.9})
    twin_a = ModelSpec("a-model", 0.001, frozenset({TaskClass.CLASSIFY}), {TaskClass.CLASSIFY: 0.9})

    forward = ModelRouter(ModelRegistry([twin_a, twin_b]), CheapestCapable())
    reverse = ModelRouter(ModelRegistry([twin_b, twin_a]), CheapestCapable())
    task = Task("t-1", TaskClass.CLASSIFY)

    assert forward.route(task).model == reverse.route(task).model == "a-model"


def test_every_decision_explains_itself() -> None:
    """A routing decision you cannot explain is one you cannot debug six weeks later."""
    router = ModelRouter(build_registry(), CheapestCapable())
    decision = router.route(Task("t-1", TaskClass.SUMMARISE))

    assert decision.reason
    assert decision.estimated_cost > 0
    assert decision.task_id == "t-1"


def test_an_empty_registry_is_rejected_at_construction() -> None:
    with pytest.raises(ValueError, match="no models"):
        ModelRegistry([])
