"""The simulated probe stream a region produces."""

from failover_budget.scenario import Scenario, timeline


def test_the_same_seed_gives_the_same_day() -> None:
    scenario = Scenario(duration=3_600.0)
    assert timeline(scenario, seed=7) == timeline(scenario, seed=7)


def test_different_seeds_give_different_days() -> None:
    scenario = Scenario(duration=3_600.0, blips_per_hour=6.0)
    assert timeline(scenario, seed=1) != timeline(scenario, seed=2)


def test_probes_arrive_once_per_interval() -> None:
    scenario = Scenario(duration=100.0, probe_interval=10.0)
    assert [t for t, _ in timeline(scenario, seed=0)] == [10.0 * i for i in range(10)]


def test_without_blips_or_an_outage_every_probe_is_healthy() -> None:
    scenario = Scenario(duration=3_600.0, blips_per_hour=0.0)
    assert all(ok is True for _, ok in timeline(scenario, seed=0))


def test_blips_are_transient() -> None:
    scenario = Scenario(duration=86_400.0, blips_per_hour=4.0)
    observations = [ok for _, ok in timeline(scenario, seed=3)]
    first_failure = observations.index(False)
    assert True in observations[first_failure:]


def test_an_outage_does_not_recover() -> None:
    scenario = Scenario(duration=3_600.0, outage_at=1_800.0)
    after = [ok for t, ok in timeline(scenario, seed=0) if t >= 1_800.0]
    assert after and all(ok is False for ok in after)


def test_a_silent_outage_stops_the_probes() -> None:
    scenario = Scenario(duration=3_600.0, outage_at=1_800.0, silent_outage=True)
    after = [ok for t, ok in timeline(scenario, seed=0) if t >= 1_800.0]
    assert after and all(ok is None for ok in after)


def test_probe_loss_drops_probes_before_any_outage() -> None:
    scenario = Scenario(duration=3_600.0, blips_per_hour=0.0, probe_loss=0.2)
    observations = [ok for _, ok in timeline(scenario, seed=0)]
    assert None in observations
    assert False not in observations
