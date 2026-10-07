"""The CLI's output: deterministic, complete, and honest about its inputs."""

from failover_budget.cli import main, render
from failover_budget.sweep import SweepConfig, run_sweep

SMALL = SweepConfig(seeds=4, calm_days=1.0)


def test_the_same_seed_prints_the_same_report() -> None:
    assert render(run_sweep(SMALL)) == render(run_sweep(SMALL))


def test_the_report_has_all_three_results() -> None:
    text = render(run_sweep(SMALL))
    for heading in ("A. The trigger trade-off", "B. The recovery budget", "C. The silent region"):
        assert heading in text


def test_the_report_states_its_assumptions_next_to_its_results() -> None:
    text = render(run_sweep(SMALL))
    assert "Poisson" in text
    assert "inputs, not measurements" in text


def test_the_module_controller_is_in_the_sweep() -> None:
    result = run_sweep(SMALL)
    assert any(row.label.startswith("window-all-unhealthy") for row in result.tradeoff)


def test_the_silent_region_separates_the_two_rules() -> None:
    """Without the rule a dark region is caught only by luck; with it, every time.

    The window trigger can still fire on a silent region -- when the region went
    dark mid-blip, so the last checks it holds are unhealthy and the healthy ones
    age out. That is luck, not detection, and it is never every run.
    """
    result = run_sweep(SweepConfig(seeds=30, calm_days=0.1))
    without = [r for r in result.silent if "silence=fail" not in r.label]
    with_rule = [r for r in result.silent if "silence=fail" in r.label]
    assert without and all(r.detected < r.runs for r in without)
    assert with_rule and all(r.detected == r.runs for r in with_rule)


def test_main_runs(capsys: object) -> None:
    assert main(["--seeds", "2", "--calm-days", "0.5"]) == 0
