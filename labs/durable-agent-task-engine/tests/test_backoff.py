from __future__ import annotations

import pytest

from task_queue.backoff import exponential_backoff_seconds


def test_backoff_grows_with_attempt() -> None:
    delays = [exponential_backoff_seconds(attempt, jitter_ratio=0.0) for attempt in (1, 2, 3, 4)]
    assert delays == [1.0, 2.0, 4.0, 8.0]


def test_backoff_is_capped() -> None:
    delay = exponential_backoff_seconds(20, base_seconds=1.0, max_seconds=30.0, jitter_ratio=0.0)
    assert delay == 30.0


def test_backoff_jitter_stays_within_bounds() -> None:
    for _ in range(200):
        delay = exponential_backoff_seconds(3, base_seconds=1.0, max_seconds=60.0, jitter_ratio=0.5)
        assert 2.0 <= delay <= 6.0  # attempt 3 -> capped=4.0, +-50% jitter


def test_backoff_rejects_non_positive_attempt() -> None:
    with pytest.raises(ValueError):
        exponential_backoff_seconds(0)
