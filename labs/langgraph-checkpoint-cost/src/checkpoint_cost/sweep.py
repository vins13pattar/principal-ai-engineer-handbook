"""Run a fixture at several lengths, because one length proves nothing.

A single run cannot distinguish linear growth from superlinear growth, and
that distinction is the whole finding.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import StateGraph

from checkpoint_cost.measuring_saver import MeasuringSaver, StepCost


@dataclass(frozen=True)
class WriteResult:
    steps: int
    total_bytes: int
    final_step_bytes: int
    per_step: list[StepCost]


def sweep_write_path(
    builder: Callable[..., StateGraph[Any, Any, Any, Any]],
    step_counts: list[int],
    payload_bytes: int,
    **builder_kwargs: object,
) -> list[WriteResult]:
    results: list[WriteResult] = []
    for steps in step_counts:
        saver = MeasuringSaver(InMemorySaver())
        graph = builder(payload_bytes=payload_bytes, **builder_kwargs)
        graph.compile(checkpointer=saver).invoke(
            {"items": [], "remaining": steps},
            {"configurable": {"thread_id": f"sweep-{steps}"}},
        )
        results.append(
            WriteResult(
                steps=steps,
                total_bytes=saver.total_bytes,
                final_step_bytes=saver.costs[-1].bytes_serialized,
                per_step=list(saver.costs),
            )
        )
    return results
