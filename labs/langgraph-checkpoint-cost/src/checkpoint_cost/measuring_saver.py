"""The instrument.

Wrapping the checkpointer, rather than timing the whole graph, is what
separates serialization cost from node execution. The graph's own runtime is
dominated by whatever the nodes do; this measures only the bytes the
checkpointer was handed and the time spent turning state into them.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver


@dataclass(frozen=True)
class StepCost:
    """What one checkpoint write cost."""

    step: int
    bytes_serialized: int
    serialize_seconds: float


@dataclass
class MeasuringSaver(BaseCheckpointSaver[Any]):
    """Delegates to a real saver, recording the cost of every write.

    Serializes with the inner saver's own serializer so the measurement is of
    LangGraph's serialization strategy, not of a stand-in.
    """

    inner: BaseCheckpointSaver[Any]
    costs: list[StepCost] = field(default_factory=list)

    def __post_init__(self) -> None:
        super().__init__()

    def put(
        self,
        config: Any,
        checkpoint: Any,
        metadata: Any,
        new_versions: Any,
    ) -> Any:
        start = time.perf_counter()
        _, blob = self.inner.serde.dumps_typed(checkpoint)
        elapsed = time.perf_counter() - start
        self.costs.append(
            StepCost(step=len(self.costs), bytes_serialized=len(blob), serialize_seconds=elapsed)
        )
        return self.inner.put(config, checkpoint, metadata, new_versions)

    def put_writes(self, config: Any, writes: Any, task_id: str, task_path: str = "") -> None:
        self.inner.put_writes(config, writes, task_id, task_path)

    def get_tuple(self, config: Any) -> Any:
        return self.inner.get_tuple(config)

    def list(self, config: Any, **kwargs: Any) -> Any:
        return self.inner.list(config, **kwargs)

    @property
    def total_bytes(self) -> int:
        return sum(c.bytes_serialized for c in self.costs)
