"""The trade-off itself: false failovers against detection delay.

Every assertion here is about shape. The numbers depend on the blip
distribution, which is an assumption, so the shape is checked under more than
one setting of it.
"""

import statistics
from functools import partial

import pytest

from failover_budget.scenario import Scenario
from failover_budget.simulate import detection_delays, false_failovers_per_day
from failover_budget.triggers import ConsecutiveFailures, WindowAllUnhealthy

SEEDS = range(20)
BLIP_SETTINGS = [
    pytest.param(20.0, id="short-blips"),
    pytest.param(60.0, id="long-blips"),
]


@pytest.mark.parametrize("blip_mean", BLIP_SETTINGS)
def test_a_more_patient_trigger_fails_over_falsely_less_often(blip_mean: float) -> None:
    calm = Scenario(duration=86_400.0, blips_per_hour=4.0, blip_mean_seconds=blip_mean)
    rates = [
        false_failovers_per_day(partial(ConsecutiveFailures, n=n), calm, SEEDS)
        for n in (1, 2, 4, 8)
    ]
    assert rates == sorted(rates, reverse=True)
    assert rates[-1] < rates[0]


@pytest.mark.parametrize("blip_mean", BLIP_SETTINGS)
def test_a_more_patient_trigger_detects_a_real_outage_later(blip_mean: float) -> None:
    outage = Scenario(
        duration=7_200.0, blips_per_hour=4.0, blip_mean_seconds=blip_mean, outage_at=3_600.0
    )
    medians = []
    for n in (1, 2, 4, 8):
        delays = detection_delays(partial(ConsecutiveFailures, n=n), outage, SEEDS)
        assert all(d is not None for d in delays)
        medians.append(statistics.median(d for d in delays if d is not None))
    assert medians == sorted(medians)
    assert medians[-1] > medians[0]


def test_the_module_controller_never_detects_in_less_than_its_window() -> None:
    clean = Scenario(duration=7_200.0, blips_per_hour=0.0, outage_at=3_600.0)
    delays = detection_delays(lambda: WindowAllUnhealthy(window=300.0), clean, SEEDS)
    assert all(d is not None and d >= 300.0 for d in delays)


def test_a_blip_already_in_progress_is_a_head_start_not_a_shortcut() -> None:
    """Measured from the outage, detection can dip under the window when a blip ran into it.

    The window is counted from the last healthy probe, not from when the outage
    began, so the typical case still spends the whole window.
    """
    noisy = Scenario(duration=7_200.0, blips_per_hour=4.0, outage_at=3_600.0)
    delays = detection_delays(lambda: WindowAllUnhealthy(window=300.0), noisy, SEEDS)
    measured = [d for d in delays if d is not None]
    assert len(measured) == len(delays)
    assert statistics.median(measured) >= 300.0


def test_the_module_controller_never_detects_a_silent_region() -> None:
    silent = Scenario(duration=7_200.0, outage_at=3_600.0, silent_outage=True)
    delays = detection_delays(lambda: WindowAllUnhealthy(window=300.0), silent, SEEDS)
    assert all(d is None for d in delays)


def test_the_silence_rule_detects_a_silent_region() -> None:
    silent = Scenario(duration=7_200.0, outage_at=3_600.0, silent_outage=True)
    make = lambda: WindowAllUnhealthy(window=300.0, silence_is_failure=True)  # noqa: E731
    assert all(d is not None for d in detection_delays(make, silent, SEEDS))


def test_false_failovers_before_an_outage_do_not_count_as_detection() -> None:
    """A fire on a blip before the outage is a false failover, not the detection."""
    noisy = Scenario(duration=7_200.0, blips_per_hour=30.0, outage_at=3_600.0)
    delays = detection_delays(lambda: ConsecutiveFailures(n=1), noisy, SEEDS)
    assert all(d is not None and d >= 0.0 for d in delays)
