"""Graders, flakiness, and the meta-test: can this harness fail at all?"""

from __future__ import annotations

from evaluation_platform.dataset import Dataset, Example
from evaluation_platform.demo import RIGHT, WRONG, build_dataset, flaky_system, system_with_accuracy
from evaluation_platform.graders import ContainsExpected, ExactMatch, NormalisedMatch
from evaluation_platform.runner import detect_flakiness, run_once


def test_the_harness_catches_a_deliberately_broken_system() -> None:
    """The meta-test. An eval that cannot fail is not an eval.

    Everything else in this suite is worthless if the harness scores a system that is
    always wrong as passing.
    """
    broken = system_with_accuracy(0.0)
    run = run_once(broken, build_dataset(100), ExactMatch(), label="broken")

    assert run.accuracy == 0.0
    assert run.correct == 0


def test_the_harness_scores_a_perfect_system_as_perfect() -> None:
    """The other half — a harness that always fails is equally useless."""
    perfect = system_with_accuracy(1.0)
    run = run_once(perfect, build_dataset(100), ExactMatch(), label="perfect")

    assert run.accuracy == 1.0


def test_measured_accuracy_tracks_the_systems_configured_accuracy() -> None:
    """If this drifts, every statistic computed on top of it is measuring the wrong thing."""
    run = run_once(system_with_accuracy(0.80), build_dataset(1_000), ExactMatch(), label="p80")

    assert 0.76 < run.accuracy < 0.84


def test_exact_match_rejects_a_difference_normalised_match_forgives() -> None:
    """Each normalisation step is a decision about what does not matter."""
    dataset = Dataset("d", (Example("e-1", "q", "Yes"),))
    shouty = lambda question, attempt: "  YES  "  # noqa: E731

    assert run_once(shouty, dataset, ExactMatch(), label="x").accuracy == 0.0
    assert run_once(shouty, dataset, NormalisedMatch(), label="n").accuracy == 1.0


def test_contains_grader_passes_an_answer_that_says_both_things() -> None:
    """Why the most permissive grader is the most dangerous.

    An output containing the right answer *and* its opposite scores as correct. This is
    not hypothetical — it is what verbose model output looks like.
    """
    dataset = Dataset("d", (Example("e-1", "q", RIGHT),))
    hedging = lambda question, attempt: f"It might be {RIGHT}, or possibly {WRONG}."  # noqa: E731

    assert run_once(hedging, dataset, ContainsExpected(), label="c").accuracy == 1.0
    assert run_once(hedging, dataset, ExactMatch(), label="x").accuracy == 0.0


def test_flaky_examples_are_reported_rather_than_averaged_away() -> None:
    """A flaky example makes every delta partly noise.

    Averaging across repeats hides the instability behind a plausible number; naming
    the unstable examples is what lets someone fix or remove them.
    """
    dataset = build_dataset(50)
    unstable = frozenset({"question 3", "question 17", "question 42"})
    report = detect_flakiness(
        flaky_system(0.85, flaky_ids=unstable), dataset, ExactMatch(), repeats=8
    )

    assert len(report.unstable) >= 2, "the flaky examples should surface"
    assert report.unstable_fraction < 0.2, "and the stable majority should not"


def test_a_deterministic_system_reports_no_flakiness() -> None:
    """Guards against the detector flagging everything, which would be equally useless."""
    report = detect_flakiness(
        system_with_accuracy(0.85), build_dataset(50), ExactMatch(), repeats=8
    )

    assert report.unstable == ()


def test_an_unverified_dataset_is_visible_as_such() -> None:
    """An eval set built from the system's own past output measures agreement, not truth.

    It cannot detect a regression that was always there, and nothing about the accuracy
    number reveals that — so the dataset carries the flag instead.
    """
    assert build_dataset(10, verified=True).verified_fraction == 1.0
    assert build_dataset(10, verified=False).verified_fraction == 0.0


def test_an_empty_dataset_does_not_report_a_flattering_accuracy() -> None:
    """Zero of zero is not 100%."""
    run = run_once(system_with_accuracy(1.0), Dataset("empty", ()), ExactMatch(), label="e")

    assert run.total == 0
    assert run.accuracy == 0.0
