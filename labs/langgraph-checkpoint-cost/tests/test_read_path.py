from checkpoint_cost.resume import measure_resume


def test_lower_snapshot_frequency_reconstructs_faster() -> None:
    """snapshot_frequency is the dial between write cost and resume cost.

    Frequent snapshots mean shallower replay. If this does not hold, the dial
    does not do what its docstring says and the Build page must report that.
    """
    frequent = measure_resume(steps=60, snapshot_frequency=5, payload_bytes=256)
    rare = measure_resume(steps=60, snapshot_frequency=10_000, payload_bytes=256)
    assert frequent.reconstruct_seconds <= rare.reconstruct_seconds


def test_resume_returns_the_state_the_run_ended_with() -> None:
    result = measure_resume(steps=20, snapshot_frequency=5, payload_bytes=64)
    assert result.item_count == 20
