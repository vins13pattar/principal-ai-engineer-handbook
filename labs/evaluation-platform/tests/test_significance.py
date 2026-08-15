"""The measurement this lab exists for: most eval sets cannot see what they claim to.

An evaluation platform's job is not to produce a number. It is to say whether a
difference between two numbers is real. These tests compute how many examples that
actually takes, and the answer is uncomfortable at the sizes teams typically use.
"""

from __future__ import annotations

import pytest

from evaluation_platform.significance import (
    Comparison,
    required_sample_size,
    smallest_detectable_delta,
)


def test_a_four_point_improvement_on_fifty_examples_is_not_a_result() -> None:
    """The headline. 84% to 88% sounds like progress and is indistinguishable from noise.

    The interval spans zero and reaches nearly ten points *negative* — the same data is
    consistent with a meaningful regression.
    """
    comparison = Comparison(
        baseline_correct=42, baseline_total=50, candidate_correct=44, candidate_total=50
    )

    low, high = comparison.confidence_interval()

    assert comparison.delta == pytest.approx(0.04)
    assert low < 0.0 < high, "the interval contains zero"
    assert low < -0.09, "and reaches far enough negative to be a regression"
    assert comparison.is_significant() is False


def test_detecting_a_three_point_gain_needs_thousands_of_examples() -> None:
    """The number to compute before building an eval set, not after.

    Effect size enters squared, so halving the delta you want to see quadruples the
    dataset. This is why "add a few more examples" never rescues an underpowered eval.
    """
    assert required_sample_size(0.85, 0.03) > 2_000
    assert required_sample_size(0.85, 0.10) < 200

    # Effect size enters squared, so the naive expectation is exactly 4x. It is worse
    # than that near a high baseline: the candidate rate moves toward 1.0, its variance
    # term shrinks, and the coarse measurement gets disproportionately cheap. Measured
    # at 4.95x here rather than assumed to be 4.0.
    coarse = required_sample_size(0.85, 0.10)
    fine = required_sample_size(0.85, 0.05)
    assert fine / coarse > 4.0, "halving the detectable delta at least quadruples the set"
    assert fine / coarse < 5.5


def test_a_small_set_can_only_see_enormous_deltas() -> None:
    """The inverse question, and the one worth putting on the dashboard.

    A fifty-example eval at 85% baseline cannot resolve anything below about twenty
    points. Every smaller movement it reports is noise being read as signal.
    """
    assert smallest_detectable_delta(0.85, 30) > 0.20
    assert smallest_detectable_delta(0.85, 50) > 0.15
    assert smallest_detectable_delta(0.85, 1_000) < 0.05


def test_bigger_sets_see_smaller_deltas_monotonically() -> None:
    sizes = (30, 50, 100, 500, 1_000, 5_000)
    deltas = [smallest_detectable_delta(0.85, n) for n in sizes]

    assert deltas == sorted(deltas, reverse=True)


def test_an_underpowered_comparison_answers_none_not_false() -> None:
    """The distinction that changes what someone does next.

    "No significant difference" and "this set cannot tell" get acted on very
    differently — the first stops the investigation, the second should start one about
    the eval set.
    """
    tiny = Comparison(
        baseline_correct=4, baseline_total=5, candidate_correct=5, candidate_total=5
    )

    assert tiny.is_significant() is None
    assert tiny.approximation_is_usable() is False


def test_a_genuinely_large_difference_on_an_adequate_set_is_detected() -> None:
    """Guards against the suite only ever proving things are undetectable.

    A test file that could only say "not significant" would pass just as well if
    `is_significant` always returned False.
    """
    real = Comparison(
        baseline_correct=600, baseline_total=1_000, candidate_correct=750, candidate_total=1_000
    )

    assert real.is_significant() is True
    low, high = real.confidence_interval()
    assert low > 0.0, "the whole interval is positive"


def test_identical_runs_are_never_significant() -> None:
    same = Comparison(
        baseline_correct=850, baseline_total=1_000, candidate_correct=850, candidate_total=1_000
    )

    assert same.delta == 0.0
    assert same.is_significant() is False


def test_required_sample_size_rejects_impossible_inputs() -> None:
    """A statistics helper that silently accepts nonsense produces confident nonsense."""
    with pytest.raises(ValueError):
        required_sample_size(0.0, 0.05)
    with pytest.raises(ValueError):
        required_sample_size(0.85, 0.0)
    with pytest.raises(ValueError):
        smallest_detectable_delta(0.85, 0)
