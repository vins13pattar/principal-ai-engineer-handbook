"""The two trigger policies, probe by probe.

Every trigger sees the same stream: one observation per probe interval, where
``True`` is a healthy probe, ``False`` an unhealthy one, and ``None`` a probe
that was due and never arrived.
"""

from collections.abc import Sequence

from failover_budget.triggers import ConsecutiveFailures, Trigger, WindowAllUnhealthy

INTERVAL = 10.0


def feed(trigger: Trigger, observations: Sequence[bool | None], start: float = 0.0) -> float | None:
    """Feed one observation per interval; return the time the trigger first fires."""
    for i, healthy in enumerate(observations):
        now = start + i * INTERVAL
        if trigger.observe(now, healthy):
            return now
    return None


class TestWindowAllUnhealthy:
    def test_does_not_fire_while_any_check_in_the_window_is_healthy(self) -> None:
        trigger = WindowAllUnhealthy(window=60.0)
        assert feed(trigger, [True] * 10 + [False, True] * 20) is None

    def test_spends_the_whole_window_detecting_a_sustained_outage(self) -> None:
        """The module's controller: detection takes at least the window it is configured with."""
        trigger = WindowAllUnhealthy(window=60.0)
        healthy_until = 9 * INTERVAL  # the last healthy probe
        fired = feed(trigger, [True] * 10 + [False] * 20)
        assert fired is not None
        assert fired - healthy_until > 60.0

    def test_treats_silence_as_health(self) -> None:
        """No checks in the window means no failover -- even when the region has gone dark."""
        trigger = WindowAllUnhealthy(window=60.0)
        assert feed(trigger, [True] * 10 + [None] * 100) is None

    def test_silence_rule_counts_a_missing_probe_as_a_failure(self) -> None:
        trigger = WindowAllUnhealthy(window=60.0, silence_is_failure=True)
        assert feed(trigger, [True] * 10 + [None] * 100) is not None

    def test_a_fresh_controller_fires_on_its_first_unhealthy_probe(self) -> None:
        """With no history, one unhealthy probe is every check in the window."""
        trigger = WindowAllUnhealthy(window=60.0)
        assert feed(trigger, [False]) == 0.0

    def test_reset_forgets_history(self) -> None:
        trigger = WindowAllUnhealthy(window=60.0)
        feed(trigger, [True] * 10)
        trigger.reset()
        assert trigger.observe(1000.0, False)


class TestConsecutiveFailures:
    def test_fires_on_the_nth_consecutive_failure(self) -> None:
        trigger = ConsecutiveFailures(n=3)
        assert feed(trigger, [True, False, False, False]) == 3 * INTERVAL

    def test_a_healthy_probe_resets_the_count(self) -> None:
        trigger = ConsecutiveFailures(n=3)
        assert feed(trigger, [False, False, True] * 10) is None

    def test_silence_is_ignored_by_default(self) -> None:
        trigger = ConsecutiveFailures(n=3)
        assert feed(trigger, [True] + [None] * 100) is None

    def test_silence_rule_counts_a_missing_probe_as_a_failure(self) -> None:
        trigger = ConsecutiveFailures(n=3, silence_is_failure=True)
        assert feed(trigger, [True] + [None] * 100) == 3 * INTERVAL

    def test_detection_grows_with_n(self) -> None:
        delays = []
        for n in (1, 2, 4, 8):
            fired = feed(ConsecutiveFailures(n=n), [True] * 5 + [False] * 20)
            assert fired is not None
            delays.append(fired)
        assert delays == sorted(delays)
        assert len(set(delays)) == len(delays)
