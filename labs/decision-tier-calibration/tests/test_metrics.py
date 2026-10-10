"""The calibration metrics recover miscalibration that was put there on purpose."""

import pytest
from synthetic import make_records

from decision_tier.metrics import (
    accuracy,
    apply_temperature,
    ece,
    fit_temperature,
    majority_baseline,
    split,
    typesafe_confidence,
)


def test_calibrated_records_have_small_ece() -> None:
    assert ece(make_records(4000, overconfidence=1.0)) < 0.03


def test_overconfident_records_have_large_ece() -> None:
    calibrated = ece(make_records(4000, overconfidence=1.0))
    overconfident = ece(make_records(4000, overconfidence=3.0))
    assert overconfident > 3 * calibrated
    assert overconfident > 0.08


def test_temperature_fitting_recovers_the_injected_overconfidence() -> None:
    fitted = fit_temperature(make_records(4000, overconfidence=2.5, seed=1))
    assert fitted == pytest.approx(2.5, rel=0.15)


def test_a_fitted_temperature_reduces_ece_on_held_out_records() -> None:
    fit, held_out = split(make_records(6000, overconfidence=3.0, seed=2), seed=0)
    temperature = fit_temperature(fit)
    assert ece(apply_temperature(held_out, temperature)) < ece(held_out) / 2


def test_temperature_scaling_never_changes_the_predicted_answer() -> None:
    records = make_records(500, overconfidence=3.0)
    assert accuracy(apply_temperature(records, 3.0)) == accuracy(records)


def test_split_is_deterministic_and_disjoint() -> None:
    records = make_records(1000)
    a_fit, a_test = split(records, seed=7)
    b_fit, b_test = split(records, seed=7)
    assert a_fit == b_fit and a_test == b_test
    assert not {r.row for r in a_fit} & {r.row for r in a_test}
    assert len(a_fit) + len(a_test) == len(records)


def test_majority_baseline_is_the_most_common_label_share() -> None:
    records = make_records(1000, options=3)
    counts = [sum(r.label == k for r in records) for k in range(3)]
    assert majority_baseline(records) == max(counts) / len(records)


def test_typesafe_confidence_means_different_things_at_different_option_counts() -> None:
    """The same top probability is a different confidence at 3 options than at 77."""
    three = typesafe_confidence((0.5, 0.25, 0.25))
    seventy_seven = typesafe_confidence((0.5,) + (0.5 / 76,) * 76)
    assert seventy_seven > three
    assert typesafe_confidence((1.0, 0.0, 0.0)) == pytest.approx(1.0)
    assert typesafe_confidence((1 / 3, 1 / 3, 1 / 3)) == pytest.approx(0.0)


def test_reliability_bins_track_accuracy_on_calibrated_records() -> None:
    from decision_tier.metrics import reliability

    for row in reliability(make_records(8000, overconfidence=1.0), bins=5):
        if row.count >= 300:
            assert abs(row.confidence - row.accuracy) < 0.05


def test_reliability_bins_expose_overconfidence() -> None:
    from decision_tier.metrics import reliability

    top = [r for r in reliability(make_records(8000, overconfidence=3.0), bins=5) if r.count][-1]
    assert top.confidence - top.accuracy > 0.05
