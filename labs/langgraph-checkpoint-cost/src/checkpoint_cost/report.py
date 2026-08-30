"""Formats what was measured. Holds no opinion about what the numbers should be.

The resume table's latency column is deliberately labelled "get_state ms", not
"reconstruct ms" or "replay ms": ``ResumeResult.reconstruct_seconds`` times the
entire ``get_state`` call (``get_tuple``, full checkpoint deserialization,
``channels_from_checkpoint``, ``prepare_next_tasks``, and
``dict(get_subgraphs())``), not an isolated replay step -- see the module
docstring in ``resume.py`` for the full accounting. Calling the column
"reconstruct" would imply the number isolates ``DeltaChannel`` replay; it
doesn't, and these numbers get published.

``format_write_table``/``WriteResult`` (Task 3's interface) report only what
``put()`` saw. ``format_write_report_table``/``WriteReport`` report the full
write-path accounting -- ``put()`` bytes and ``put_writes()`` bytes as two
separate columns, never silently summed for the reader, because for
``DeltaChannel`` they are non-overlapping and both required, while for every
other channel in this lab ``put_writes`` bytes largely duplicate what
``put()`` already counted (see ``measuring_saver.py``'s module docstring).
Summing them here would erase that distinction; the CLI table shows both and
lets the reader add them with eyes open.
"""

from __future__ import annotations

from dataclasses import dataclass

from checkpoint_cost.resume import ResumeResult
from checkpoint_cost.sweep import WriteResult


def format_write_table(results: list[WriteResult]) -> str:
    """``put()``-only totals. Blind to ``DeltaChannel``'s actual state -- see module docstring."""
    lines = [f"{'steps':>6}  {'total bytes':>12}  {'final step bytes':>17}"]
    for r in results:
        lines.append(f"{r.steps:>6}  {r.total_bytes:>12}  {r.final_step_bytes:>17}")
    return "\n".join(lines)


@dataclass(frozen=True)
class WriteReport:
    """Full write-path accounting for one sweep point.

    ``put_bytes`` and ``writes_bytes`` are kept as separate fields rather
    than pre-summed, for the same reason ``measuring_saver.py`` keeps
    ``costs`` and ``write_costs`` separate: they are the same thing only for
    ``DeltaChannel``. ``item_count``/``expected_items`` let a caller detect a
    run that silently produced fewer items than it should have -- a small
    byte count from a short run looks identical to a small byte count from a
    cheap channel unless something checks.
    """

    steps: int
    put_bytes: int
    writes_bytes: int
    final_step_bytes: int
    item_count: int
    expected_items: int


def format_write_report_table(results: list[WriteReport]) -> str:
    header = (
        f"{'steps':>6}  {'put bytes':>10}  {'writes bytes':>13}  "
        f"{'put+writes':>11}  {'final step bytes':>17}  {'items':>9}"
    )
    lines = [header]
    for r in results:
        total = r.put_bytes + r.writes_bytes
        items = f"{r.item_count}/{r.expected_items}"
        lines.append(
            f"{r.steps:>6}  {r.put_bytes:>10}  {r.writes_bytes:>13}  "
            f"{total:>11}  {r.final_step_bytes:>17}  {items:>9}"
        )
    return "\n".join(lines)


def format_resume_table(results: list[ResumeResult]) -> str:
    lines = [f"{'steps':>6}  {'snapshot freq':>14}  {'get_state ms':>15}  {'items':>6}"]
    for r in results:
        lines.append(
            f"{r.steps:>6}  {r.snapshot_frequency:>14}  "
            f"{r.reconstruct_seconds * 1000:>15.2f}  {r.item_count:>6}"
        )
    return "\n".join(lines)
