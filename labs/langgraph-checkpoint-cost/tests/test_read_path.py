from checkpoint_cost.resume import measure_resume

# Reconstruct times at these parameters are tens-to-hundreds of microseconds --
# small enough that a single perf_counter() sample is vulnerable to a GC pause
# or scheduler preemption landing in the fast arm, especially on a shared CI
# runner. Best-of-N (min) per arm keeps the assertion's direction intact
# (still comparing the two arms head to head) while filtering out one-off
# noise spikes rather than loosening what's being asserted.
_SAMPLES = 7


def _best_reconstruct_seconds(*, steps: int, snapshot_frequency: int, payload_bytes: int) -> float:
    return min(
        measure_resume(
            steps=steps, snapshot_frequency=snapshot_frequency, payload_bytes=payload_bytes
        ).reconstruct_seconds
        for _ in range(_SAMPLES)
    )


def test_lower_snapshot_frequency_reconstructs_faster() -> None:
    """snapshot_frequency is the dial between write cost and resume cost.

    Frequent snapshots mean a shallower ancestor-write replay inside
    get_state (verified: at these exact parameters the frequent arm replays
    1 ancestor write vs. the rare arm's 61 -- not a zero-replay direct
    restore, but close to the shallowest replay possible short of that). If
    this does not hold, the dial does not do what its docstring says and the
    Build page must report that.
    """
    frequent = _best_reconstruct_seconds(steps=60, snapshot_frequency=5, payload_bytes=256)
    rare = _best_reconstruct_seconds(steps=60, snapshot_frequency=10_000, payload_bytes=256)
    assert frequent <= rare


def test_resume_returns_the_state_the_run_ended_with() -> None:
    result = measure_resume(steps=20, snapshot_frequency=5, payload_bytes=64)
    assert result.item_count == 20
