"""One command that prints both halves of the trade."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import AbstractContextManager, contextmanager
from typing import Any
from unittest import mock

import langgraph.pregel._executor as _pregel_executor
from langchain_core.runnables import RunnableConfig
from langchain_core.runnables.config import get_executor_for_config as _get_executor_for_config

from checkpoint_cost.graphs import build_accumulating, build_delta, build_non_accumulating
from checkpoint_cost.report import format_resume_table, format_write_table
from checkpoint_cost.resume import measure_resume
from checkpoint_cost.sweep import sweep_write_path

STEP_COUNTS = [10, 25, 50, 100]
PAYLOAD = 256

# langgraph 1.2.11's DeltaChannel write path can deadlock at these step
# counts: an order inversion in `_checkpointer_put_after_previous` lets a
# task occupy a worker while waiting on a future queued behind it (see the
# full accounting in resume.py's module docstring). resume.py works around
# it by passing `max_concurrency` on its own `invoke` config, but
# `sweep_write_path` (Task 3, not to be modified here) builds its invoke
# config internally with no way to inject one. The workaround is applied
# below instead, by patching the executor factory langgraph's Pregel loop
# calls into (`BackgroundExecutor.__init__` -> `get_executor_for_config`) so
# every thread pool it creates during the delta sweep gets the same
# generously-sized `max_concurrency`, regardless of what config the caller
# passed in.
_DELTA_MAX_CONCURRENCY = 256


def _get_executor_with_delta_workaround(
    config: RunnableConfig | None,
) -> AbstractContextManager[Any]:
    patched: dict[str, Any] = dict(config or {})
    patched.setdefault("max_concurrency", _DELTA_MAX_CONCURRENCY)
    return _get_executor_for_config(patched)  # type: ignore[arg-type]


@contextmanager
def _delta_deadlock_workaround() -> Iterator[None]:
    with mock.patch.object(
        _pregel_executor,
        "get_executor_for_config",
        _get_executor_with_delta_workaround,
    ):
        yield


def main() -> None:
    print("\naccumulating (full state re-serialized every step)")
    print(format_write_table(sweep_write_path(build_accumulating, STEP_COUNTS, PAYLOAD)))

    print("\nnon-accumulating (the control)")
    print(format_write_table(sweep_write_path(build_non_accumulating, STEP_COUNTS, PAYLOAD)))

    print("\naccumulating with DeltaChannel")
    with _delta_deadlock_workaround():
        print(
            format_write_table(
                sweep_write_path(build_delta, STEP_COUNTS, PAYLOAD, snapshot_frequency=1000)
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
