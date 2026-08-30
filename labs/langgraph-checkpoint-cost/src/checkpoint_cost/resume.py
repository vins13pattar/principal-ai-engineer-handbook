"""What it costs to get state back.

``DeltaChannel`` stores only a sentinel in checkpoint blobs and reconstructs
state by replaying ancestor writes through the reducer, writing a full
snapshot every ``snapshot_frequency`` updates. Task 3 measured the write
path, where that sentinel makes each checkpoint blob small. This module
measures the other side of that trade: the cost of turning the sentinel back
into real state. A lab that reported only the write path would call
``DeltaChannel`` free -- it isn't, it's deferred.

Each measurement compiles a *second* graph, against the same ``InMemorySaver``,
before timing ``get_state``. That second compile is not decoration: LangGraph
resolves ``get_state`` through the checkpointer's stored checkpoint plus
pending writes, not through any in-memory channel object the first compiled
graph created. Nothing about the first run's compiled graph, its channels, or
its ``CompiledStateGraph`` is reachable from the second one -- they share only
the ``saver``, and ``InMemorySaver`` stores serialized checkpoint tuples
(dict-of-bytes), not live channel objects. So ``reader.get_state(config)``
must re-run ``DeltaChannel.update`` across the replayed writes; there is no
warm cache to hit.

**A real deadlock in langgraph 1.2.11's DeltaChannel write path, and why
``max_concurrency`` is set below.** Every superstep submits a
``checkpointer.put_writes`` future to a bounded ``ThreadPoolExecutor`` (sized
``min(32, os.cpu_count() + 4)`` by default). When a step writes to a
``DeltaChannel``, that future is *also* stashed in ``_delta_write_futs``, and
the *next* step's checkpoint ``put`` -- itself queued on the same pool,
chained to wait on the *previous* step's ``put`` future -- additionally
blocks on ``concurrent.futures.wait(_delta_write_futs)``
(``langgraph/pregel/_loop.py::_checkpointer_put_after_previous``). At
sufficient chain depth (empirically, roughly 3x the pool's worker count on
this machine: steps=60 against a 14-worker pool reproduced it directly)
every worker can simultaneously end up blocked inside `.result()`/`.wait()`
for a future that never gets a worker to run on -- a thread-pool starvation
deadlock, confirmed via ``faulthandler.dump_traceback_later``, not merely
slow. Plain (non-``DeltaChannel``) graphs never hit this: only a
``DeltaChannel`` write appends to ``_delta_write_futs``, so only they add the
second wait that turns ordinary chain depth into starvation. Passing
``max_concurrency`` in the config raises the pool size so the chain never
exceeds it, which reproducibly avoided the deadlock across 60/60 runs at
steps=60 in local testing (vs. failures within the first ~5 of 30 runs with
no ``max_concurrency`` set). See the Task 4 report for the full
reproduction.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver

from checkpoint_cost.graphs import build_delta

# Large enough that the checkpoint-put future chain (one link per superstep)
# never approaches the pool's worker count, regardless of how many steps a
# measurement runs or how many cores the host has. See the module docstring.
_MAX_CONCURRENCY = 256


@dataclass(frozen=True)
class ResumeResult:
    steps: int
    snapshot_frequency: int
    reconstruct_seconds: float
    item_count: int


def measure_resume(steps: int, snapshot_frequency: int, payload_bytes: int) -> ResumeResult:
    saver = InMemorySaver()
    graph = build_delta(payload_bytes=payload_bytes, snapshot_frequency=snapshot_frequency)
    compiled = graph.compile(checkpointer=saver)
    config: RunnableConfig = {
        "configurable": {"thread_id": f"resume-{steps}-{snapshot_frequency}"},
        "max_concurrency": _MAX_CONCURRENCY,
    }
    compiled.invoke({"items": [], "remaining": steps}, config)

    # A fresh compile against the same saver: nothing from the first run's
    # compiled graph or its channels is reachable here, so the only thing the
    # two runs share is the serialized checkpoint history in `saver`. The
    # timing below is reconstruction through DeltaChannel's reducer replay,
    # not a cache hit.
    reader = build_delta(
        payload_bytes=payload_bytes, snapshot_frequency=snapshot_frequency
    ).compile(checkpointer=saver)
    start = time.perf_counter()
    state = reader.get_state(config)
    elapsed = time.perf_counter() - start

    return ResumeResult(
        steps=steps,
        snapshot_frequency=snapshot_frequency,
        reconstruct_seconds=elapsed,
        item_count=len(state.values["items"]),
    )
