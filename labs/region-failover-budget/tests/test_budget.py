"""The recovery budget: detection plus everything that has to happen after it."""

import pytest

from failover_budget.budget import STANDBY_TIERS, Platform, detection_allowance, recovery

PLATFORM = Platform()
RTO = 900.0


def test_recovery_is_the_sum_of_its_stages() -> None:
    r = recovery(detection=120.0, platform=PLATFORM, standby=STANDBY_TIERS["warm"])
    assert r.total == r.detection + r.promotion + r.traffic_shift + r.warmup


def test_a_colder_standby_takes_longer_to_warm() -> None:
    warmups = [PLATFORM.warmup(STANDBY_TIERS[name]) for name in ("hot", "warm", "cold")]
    assert warmups == sorted(warmups)
    assert warmups[0] == 0.0
    assert warmups[0] < warmups[1] < warmups[2]


def test_warmup_scales_with_model_size() -> None:
    small = Platform(model_gb=16.0).warmup(STANDBY_TIERS["warm"])
    large = Platform(model_gb=140.0).warmup(STANDBY_TIERS["warm"])
    assert large > small


@pytest.mark.parametrize("tier", ["hot", "warm", "cold"])
def test_a_trigger_whose_window_is_the_rto_breaches_it_on_every_tier(tier: str) -> None:
    """Module 11's controller, configured as the module describes: window = RTO."""
    r = recovery(detection=RTO, platform=PLATFORM, standby=STANDBY_TIERS[tier])
    assert r.breaches(RTO)


def test_detection_allowance_is_what_the_rto_leaves_after_everything_else() -> None:
    standby = STANDBY_TIERS["warm"]
    allowance = detection_allowance(RTO, PLATFORM, standby)
    assert not recovery(allowance, PLATFORM, standby).breaches(RTO)
    assert recovery(allowance + 1.0, PLATFORM, standby).breaches(RTO)


def test_a_colder_standby_leaves_less_time_to_detect() -> None:
    allowances = [
        detection_allowance(RTO, PLATFORM, STANDBY_TIERS[n]) for n in ("hot", "warm", "cold")
    ]
    assert allowances == sorted(allowances, reverse=True)


def test_detection_share_is_measured_against_the_rto() -> None:
    r = recovery(detection=450.0, platform=PLATFORM, standby=STANDBY_TIERS["hot"])
    assert r.detection_share(RTO) == pytest.approx(0.5)
