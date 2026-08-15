"""The measurement this lab exists for, including the result that surprised me.

Escalation — try the cheap model, fall back to the expensive one when it looks
unsure — is standard advice, and the intuition behind it is that it saves money while
keeping quality. The first version of this suite asserted exactly that. It failed, and
the failure was right.

What the measurement actually shows:

1. Escalation reliably buys accuracy. That part holds.
2. Escalation *always* costs more, because the first call is never refunded.
3. Cost per correct answer gets **worse** under escalation at every cost ratio tested,
   down to 2x — because the cheap baseline is already right most of the time, and its
   many cheap correct answers dominate the average.

So the metric that decides is not cost per correct answer. It is the marginal cost of
each answer escalation *rescued*, and whether that price is worth paying is a question
about what a wrong answer costs you — which a router cannot answer.
"""

from __future__ import annotations

from model_router.demo import LARGE, SMALL, build_registry, build_workload
from model_router.execution import ConfidenceSignal, SimulatedModel
from model_router.models import ModelSpec, TaskClass
from model_router.policy import CheapestCapable
from model_router.registry import ModelRegistry
from model_router.router import EscalatingRouter, ModelRouter
from model_router.workload import WorkloadResult, run_direct, run_escalating


def _measure(
    signal: ConfidenceSignal, *, cost_ratio: float | None = None, size: int = 200
) -> tuple[WorkloadResult, WorkloadResult]:
    """Baseline and escalating results over one workload. Returns (cheap, escalating)."""
    if cost_ratio is None:
        registry = build_registry()
    else:
        big = ModelSpec(
            "large", SMALL.cost_per_1k_tokens * cost_ratio, LARGE.supports, LARGE.quality
        )
        registry = ModelRegistry([SMALL, big])

    executor = SimulatedModel(signal=signal)
    router = ModelRouter(registry, CheapestCapable())
    escalating = EscalatingRouter(router, registry, executor)
    tasks = build_workload(size=size)

    return (
        run_direct(tasks, router, registry, executor),
        run_escalating(tasks, escalating, label="escalating"),
    )


def test_escalation_buys_accuracy_and_always_costs_more() -> None:
    """Both halves, asserted together, because reporting only the first is the sales pitch."""
    cheap, escalated = _measure(ConfidenceSignal.INFORMATIVE)

    assert escalated.accuracy > cheap.accuracy
    assert escalated.total_cost > cheap.total_cost, "the first call is never refunded"


def test_cost_per_correct_answer_gets_worse_even_at_a_two_times_cost_ratio() -> None:
    """The result that corrected my assumption, pinned so it cannot drift back.

    A cheap model already right 83% of the time contributes a large number of cheap
    correct answers. Escalation adds a smaller number of expensive ones. The average
    can only move upward — even when the expensive model is barely more expensive.
    """
    for ratio in (2, 5, 10, 75):
        cheap, escalated = _measure(ConfidenceSignal.INFORMATIVE, cost_ratio=ratio)
        assert escalated.cost_per_correct_answer > cheap.cost_per_correct_answer, (
            f"at {ratio}x, escalation improved cost-per-correct — if this is now true, "
            "the lab's central finding has changed and the README needs rewriting"
        )


def test_marginal_cost_per_rescued_answer_scales_with_the_cost_ratio() -> None:
    """The number that actually decides, and how it moves.

    Each answer escalation rescues costs roughly in proportion to how much more
    expensive the escalation target is. That is the quantity to put in front of whoever
    owns the budget — not total spend, and not accuracy.
    """
    cheap_2x, esc_2x = _measure(ConfidenceSignal.INFORMATIVE, cost_ratio=2)
    cheap_75x, esc_75x = _measure(ConfidenceSignal.INFORMATIVE, cost_ratio=75)

    marginal_2x = esc_2x.marginal_cost_per_additional_correct(cheap_2x)
    marginal_75x = esc_75x.marginal_cost_per_additional_correct(cheap_75x)

    assert marginal_2x > 0
    assert marginal_75x > marginal_2x * 10, "a 37x price gap should show up in the margin"


def test_an_uninformative_confidence_signal_makes_the_margin_far_worse() -> None:
    """Same policy, same threshold — only the signal's usefulness differs.

    Nothing in the API distinguishes an informative confidence number from a
    meaningless one, which is why it has to be measured rather than assumed.
    """
    good_base, good = _measure(ConfidenceSignal.INFORMATIVE)
    bad_base, bad = _measure(ConfidenceSignal.UNINFORMATIVE)

    assert good.accuracy > bad.accuracy
    assert bad.marginal_cost_per_additional_correct(
        bad_base
    ) > good.marginal_cost_per_additional_correct(good_base)


def test_escalation_still_fires_on_a_meaningless_signal() -> None:
    """It cannot tell. That is the point: the spend happens either way."""
    _, escalated = _measure(ConfidenceSignal.UNINFORMATIVE)

    assert escalated.escalations > 0


def test_escalation_does_not_fire_when_already_on_the_best_model() -> None:
    """Guards a real waste: escalating from the best model re-runs it and bills twice."""
    registry = build_registry()
    executor = SimulatedModel(signal=ConfidenceSignal.INFORMATIVE)
    escalating = EscalatingRouter(ModelRouter(registry, CheapestCapable()), registry, executor)
    # CODE is supported only by `large`, which is also the best model for it.
    tasks = build_workload(size=25, task_class=TaskClass.CODE)

    assert run_escalating(tasks, escalating, label="code").escalations == 0


def test_results_are_reproducible_across_runs() -> None:
    """A measurement that moves between runs cannot support a cost argument."""
    first_base, first = _measure(ConfidenceSignal.INFORMATIVE)
    second_base, second = _measure(ConfidenceSignal.INFORMATIVE)

    assert (first.total_cost, first.correct, first.escalations) == (
        second.total_cost,
        second.correct,
        second.escalations,
    )
    assert first_base.total_cost == second_base.total_cost
