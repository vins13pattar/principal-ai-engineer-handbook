from checkpoint_cost.measuring_saver import StepCost
from checkpoint_cost.report import (
    WriteReport,
    format_resume_table,
    format_write_report_table,
    format_write_table,
)
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


def test_write_report_table_shows_put_and_writes_bytes_separately() -> None:
    """The regression this table exists for: put bytes and writes bytes must

    both be visible, unsummed, so a reader can tell a DeltaChannel row (where
    put bytes alone understate the total) from a row where they're the whole
    story.
    """
    results = [
        WriteReport(
            steps=10, put_bytes=100, writes_bytes=0, final_step_bytes=20, item_count=10, expected_items=10
        ),
        WriteReport(
            steps=20, put_bytes=5, writes_bytes=300, final_step_bytes=1, item_count=20, expected_items=20
        ),
    ]
    table = format_write_report_table(results)
    assert "100" in table and "300" in table
    assert len(table.strip().splitlines()) == 3  # header + two rows
