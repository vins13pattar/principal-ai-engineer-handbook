"""One command that prints both halves of the trade."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import StateGraph

from checkpoint_cost.graphs import build_accumulating, build_delta, build_non_accumulating
from checkpoint_cost.measuring_saver import MeasuringSaver
from checkpoint_cost.report import WriteReport, format_resume_table, format_write_report_table
from checkpoint_cost.resume import measure_resume

STEP_COUNTS = [10, 25, 50, 100]
PAYLOAD = 256

# langgraph 1.2.11's DeltaChannel write path can deadlock: an order inversion
# in `_checkpointer_put_after_previous` lets a task occupy a thread-pool
# worker while waiting on a future queued behind it (full mechanism in
# resume.py's module docstring, which hits the same bug on the resume side
# and applies the same fix). This is load-bearing, not precautionary: an
# unpatched 100-step delta sweep was observed to hang and was killed after 5
# minutes. Passing `max_concurrency` does not perturb the measurement --
# byte counts under the patch match unpatched runs at step counts where the
# unpatched run does complete.
_DELTA_MAX_CONCURRENCY = 256


def _sweep_write_path_with_full_accounting(
    builder: Callable[..., StateGraph[Any, Any, Any, Any]],
    step_counts: list[int],
    payload_bytes: int,
    expected_items: Callable[[int], int] = lambda steps: steps,
    max_concurrency: int | None = None,
    **builder_kwargs: object,
) -> list[WriteReport]:
    """Like ``sweep.sweep_write_path`` (Task 3), but also records
    ``put_writes`` bytes and checks each run reached the expected item count.

    ``sweep_write_path`` can't be reused unmodified for this: it discards the
    ``MeasuringSaver`` after each run, and its return type (``WriteResult``)
    has no slot for ``put_writes`` bytes -- both the saver and that slot are
    needed to account for ``DeltaChannel`` honestly (see
    ``measuring_saver.py``'s module docstring). ``expected_items`` is a
    function of ``steps`` because it differs by arm: accumulating and delta
    graphs grow to ``steps`` items, but the non-accumulating control replaces
    state each step and should always land on exactly 1 -- that's the whole
    point of it being the control. Without a check here, an arm that quietly
    produced fewer items than expected (e.g. from a batching bug) would just
    print a smaller, wrong number with nothing to distinguish it from a
    genuinely cheap run.
    """
    reports = []
    for steps in step_counts:
        saver = MeasuringSaver(InMemorySaver())
        graph = builder(payload_bytes=payload_bytes, **builder_kwargs)
        base_config: RunnableConfig = {"configurable": {"thread_id": f"sweep-{steps}"}}
        config: RunnableConfig = (
            {**base_config, "max_concurrency": max_concurrency}
            if max_concurrency is not None
            else base_config
        )

        result = graph.compile(checkpointer=saver).invoke(
            {"items": [], "remaining": steps}, config
        )

        actual_items = len(result["items"])
        want_items = expected_items(steps)
        if actual_items != want_items:
            raise RuntimeError(
                f"{getattr(builder, '__name__', builder)}: expected {want_items} items "
                f"after {steps} steps, got {actual_items} -- arms are not comparable, "
                "the numbers below would not be trustworthy"
            )

        reports.append(
            WriteReport(
                steps=steps,
                put_bytes=saver.total_bytes,
                writes_bytes=saver.total_write_bytes,
                final_step_bytes=saver.costs[-1].bytes_serialized,
                item_count=actual_items,
                expected_items=want_items,
            )
        )
    return reports


def main() -> None:
    print("\naccumulating (full state re-serialized every step)")
    print(
        format_write_report_table(
            _sweep_write_path_with_full_accounting(build_accumulating, STEP_COUNTS, PAYLOAD)
        )
    )

    print("\nnon-accumulating (the control)")
    print(
        format_write_report_table(
            _sweep_write_path_with_full_accounting(
                build_non_accumulating,
                STEP_COUNTS,
                PAYLOAD,
                expected_items=lambda _steps: 1,
            )
        )
    )

    print("\naccumulating with DeltaChannel")
    print(
        format_write_report_table(
            _sweep_write_path_with_full_accounting(
                build_delta,
                STEP_COUNTS,
                PAYLOAD,
                max_concurrency=_DELTA_MAX_CONCURRENCY,
                snapshot_frequency=1000,
            )
        )
    )

    print("\nresume cost, swept over snapshot_frequency")
    print(
        format_resume_table(
            [
                measure_resume(steps=100, snapshot_frequency=f, payload_bytes=PAYLOAD)
                for f in (5, 25, 100, 10_000)
            ]
        )
    )


if __name__ == "__main__":
    main()
