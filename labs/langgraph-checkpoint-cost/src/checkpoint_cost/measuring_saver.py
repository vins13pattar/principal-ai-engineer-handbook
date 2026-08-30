"""The instrument.

Wrapping the checkpointer, rather than timing the whole graph, is what
separates serialization cost from node execution. The graph's own runtime is
dominated by whatever the nodes do; this measures only the bytes the
checkpointer was handed and the time spent turning state into them.

The byte count mirrors exactly what a real saver (e.g. ``InMemorySaver``)
serializes on ``put``: one blob per channel named in ``new_versions``, one
blob for the checkpoint remainder (everything but ``channel_values``), and
one blob for metadata -- never the whole checkpoint as a single unit, since
that is not what gets written to storage.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver, get_checkpoint_metadata


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
        # Use the inner saver's serializer, not the base class's default, so
        # anything that reads self.serde later measures with the same
        # serializer put() actually uses.
        super().__init__(serde=self.inner.serde)

    def put(
        self,
        config: Any,
        checkpoint: Any,
        metadata: Any,
        new_versions: Any,
    ) -> Any:
        start = time.perf_counter()

        # Mirror InMemorySaver.put's write pattern: channel_values is popped
        # out and only the channels named in new_versions are re-serialized,
        # each as its own blob; the checkpoint remainder and the metadata are
        # each serialized separately too. Whole-checkpoint serialization
        # would count channels the real saver never re-writes on this step.
        remainder = checkpoint.copy()
        values: dict[str, Any] = remainder.pop("channel_values")

        total_bytes = 0
        for channel in new_versions:
            if channel in values:
                _, blob = self.serde.dumps_typed(values[channel])
                total_bytes += len(blob)
            # A channel with no value in this checkpoint serializes to an
            # empty blob (InMemorySaver's ("empty", b"") fallback) -- 0 bytes.

        _, remainder_blob = self.serde.dumps_typed(remainder)
        total_bytes += len(remainder_blob)

        _, metadata_blob = self.serde.dumps_typed(get_checkpoint_metadata(config, metadata))
        total_bytes += len(metadata_blob)

        elapsed = time.perf_counter() - start
        self.costs.append(
            StepCost(
                step=len(self.costs), bytes_serialized=total_bytes, serialize_seconds=elapsed
            )
        )
        return self.inner.put(config, checkpoint, metadata, new_versions)

    def put_writes(self, config: Any, writes: Any, task_id: str, task_path: str = "") -> None:
        self.inner.put_writes(config, writes, task_id, task_path)

    def get_tuple(self, config: Any) -> Any:
        return self.inner.get_tuple(config)

    def list(self, config: Any, **kwargs: Any) -> Any:
        return self.inner.list(config, **kwargs)

    async def aput(
        self,
        config: Any,
        checkpoint: Any,
        metadata: Any,
        new_versions: Any,
    ) -> Any:
        # Route through the measuring put(), same as InMemorySaver's own
        # aput delegates to its sync put -- so async writes are measured too.
        return self.put(config, checkpoint, metadata, new_versions)

    async def aput_writes(
        self, config: Any, writes: Any, task_id: str, task_path: str = ""
    ) -> None:
        self.put_writes(config, writes, task_id, task_path)

    async def aget_tuple(self, config: Any) -> Any:
        return self.get_tuple(config)

    async def alist(self, config: Any, **kwargs: Any) -> Any:
        for item in self.list(config, **kwargs):
            yield item

    @property
    def total_bytes(self) -> int:
        return sum(c.bytes_serialized for c in self.costs)
