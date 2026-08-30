from checkpoint_cost.graphs import build_accumulating, build_non_accumulating
from checkpoint_cost.sweep import sweep_write_path

STEPS = [5, 10, 20]


def test_a_non_accumulating_graph_shows_flat_cost() -> None:
    """The meta-test. If this fails, every other number here is unattributable.

    A rising curve for a graph whose state never grows means the harness is
    measuring step overhead or its own bookkeeping, and "cost grows with run
    length" would be true by construction.
    """
    results = sweep_write_path(build_non_accumulating, STEPS, payload_bytes=64)
    first, last = results[0].final_step_bytes, results[-1].final_step_bytes
    assert last < first * 1.5


def test_an_accumulating_graph_does_not_show_flat_cost() -> None:
    """The meta-test's twin. A harness that cannot detect growth is equally useless."""
    results = sweep_write_path(build_accumulating, STEPS, payload_bytes=64)
    assert results[-1].final_step_bytes > results[0].final_step_bytes * 1.5


def test_cumulative_bytes_grow_faster_than_step_count_when_state_accumulates() -> None:
    results = sweep_write_path(build_accumulating, STEPS, payload_bytes=64)
    ratio_steps = results[-1].steps / results[0].steps
    ratio_bytes = results[-1].total_bytes / results[0].total_bytes
    assert ratio_bytes > ratio_steps
