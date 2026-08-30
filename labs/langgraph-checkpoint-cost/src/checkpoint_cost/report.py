"""Formats what was measured. Holds no opinion about what the numbers should be.

The resume table's latency column is deliberately labelled "get_state ms", not
"reconstruct ms" or "replay ms": ``ResumeResult.reconstruct_seconds`` times the
entire ``get_state`` call (``get_tuple``, full checkpoint deserialization,
``channels_from_checkpoint``, ``prepare_next_tasks``, and
``dict(get_subgraphs())``), not an isolated replay step -- see the module
docstring in ``resume.py`` for the full accounting. Calling the column
"reconstruct" would imply the number isolates ``DeltaChannel`` replay; it
doesn't, and these numbers get published.
"""

from __future__ import annotations

from checkpoint_cost.resume import ResumeResult
from checkpoint_cost.sweep import WriteResult


def format_write_table(results: list[WriteResult]) -> str:
    lines = [f"{'steps':>6}  {'total bytes':>12}  {'final step bytes':>17}"]
    for r in results:
        lines.append(f"{r.steps:>6}  {r.total_bytes:>12}  {r.final_step_bytes:>17}")
    return "\n".join(lines)


def format_resume_table(results: list[ResumeResult]) -> str:
    lines = [f"{'steps':>6}  {'snapshot freq':>14}  {'get_state ms':>15}"]
    for r in results:
        lines.append(
            f"{r.steps:>6}  {r.snapshot_frequency:>14}  {r.reconstruct_seconds * 1000:>15.2f}"
        )
    return "\n".join(lines)
