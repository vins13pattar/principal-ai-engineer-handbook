"""The escalation threshold: what it keeps, how right that is, and whether a fitted one holds."""

from synthetic import make_records

from decision_tier.metrics import split
from decision_tier.threshold import fit_threshold, sweep


def test_raising_the_threshold_never_keeps_more() -> None:
    points = sweep(make_records(3000), [i / 20 for i in range(20)])
    coverages = [p.coverage for p in points]
    assert coverages == sorted(coverages, reverse=True)


def test_on_calibrated_records_accuracy_rises_with_the_threshold() -> None:
    points = [p for p in sweep(make_records(6000), [0.3, 0.5, 0.7, 0.9]) if p.kept >= 50]
    accuracies = [p.accuracy for p in points]
    assert accuracies == sorted(accuracies)
    assert accuracies[-1] > accuracies[0]


def test_a_threshold_fitted_on_calibrated_records_holds_on_held_out_ones() -> None:
    fit, held_out = split(make_records(8000, seed=3), seed=1)
    threshold = fit_threshold(fit, target_error=0.10)
    assert threshold is not None
    kept = [p for p in sweep(held_out, [threshold])][0]
    assert kept.kept > 0
    assert 1 - kept.accuracy <= 0.10 + 0.03


def test_a_threshold_fitted_on_overconfident_records_misses_on_calibrated_traffic() -> None:
    """Fitting on one calibration and deploying on another is how a threshold silently breaks."""
    fitted_on = make_records(8000, overconfidence=1.0, seed=4)
    deployed_on = make_records(8000, overconfidence=3.0, seed=5)
    threshold = fit_threshold(fitted_on, target_error=0.10)
    assert threshold is not None
    kept = sweep(deployed_on, [threshold])[0]
    assert 1 - kept.accuracy > 0.10


def test_no_threshold_when_the_target_is_unreachable() -> None:
    hopeless = make_records(2000, options=10, spread=0.1)
    assert fit_threshold(hopeless, target_error=0.01, min_kept=100) is None
