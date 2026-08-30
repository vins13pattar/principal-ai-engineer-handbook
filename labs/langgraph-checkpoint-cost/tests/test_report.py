from checkpoint_cost.measuring_saver import StepCost
from checkpoint_cost.report import format_resume_table, format_write_table
from checkpoint_cost.resume import ResumeResult
from checkpoint_cost.sweep import WriteResult


def test_table_has_one_row_per_sweep_point() -> None:
    results = [
        WriteResult(steps=10, total_bytes=100, final_step_bytes=20, per_step=[StepCost(0, 20, 0.1)]),
        WriteResult(steps=20, total_bytes=400, final_step_bytes=40, per_step=[StepCost(0, 40, 0.2)]),
    ]
    table = format_write_table(results)
    assert "10" in table and "20" in table
    assert len(table.strip().splitlines()) == 3  # header + two rows


def test_resume_table_has_one_row_per_sweep_point() -> None:
    results = [
        ResumeResult(steps=100, snapshot_frequency=5, reconstruct_seconds=0.001, item_count=100),
        ResumeResult(steps=100, snapshot_frequency=25, reconstruct_seconds=0.002, item_count=100),
    ]
    table = format_resume_table(results)
    assert "5" in table and "25" in table
    assert len(table.strip().splitlines()) == 3  # header + two rows
