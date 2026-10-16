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

**What ``reconstruct_seconds`` actually times.** The timed region is the
entire ``get_state`` call, not an isolated "replay" step. That includes
``checkpointer.get_tuple`` (fetch + full checkpoint deserialization),
``channels_from_checkpoint`` (the ``DeltaChannel`` ancestor walk this module
cares about), ``prepare_next_tasks``, and ``dict(self.get_subgraphs())`` --
all inside ``Pregel._prepare_state_snapshot``. That fixed per-call overhead
is why a large difference in replay depth does not translate into an equally
large difference in wall time (see "Actual replay depth" below): the timer
is real end-to-end resume/``get_state`` latency, of which ancestor-write
replay is only one part.

**A real deadlock in langgraph's DeltaChannel write path, fixed in 1.2.15.**
Every superstep submits a ``checkpointer.put_writes`` future to a bounded
``ThreadPoolExecutor`` (sized ``min(32, os.cpu_count() + 4)`` by default,
via LangChain's ``get_executor_for_config``) -- the *same* pool node
execution itself is submitted to (``pregel/_runner.py``'s task-scheduling
loop calls ``self.submit()``, i.e. the same ``BackgroundExecutor``). When a
step writes to a ``DeltaChannel``, its ``put_writes`` future is *also*
appended to the loop's ``_delta_write_futs`` list.

Through ``1.2.14``, ``_checkpointer_put_after_previous`` drained that shared
list and waited on whatever it held **at execution time, not at submission
time**. Because the main loop keeps advancing while earlier
``_checkpointer_put_after_previous`` calls are still queued waiting for a
free worker, a task that finally got a worker could find ``_delta_write_futs``
holding futures that were submitted to the pool *after* this task itself
was -- i.e. a task occupying a worker while waiting on another task queued
behind it. With enough such tasks queued at once (and node-execution futures
also competing for the same pool), every worker could simultaneously be
parked waiting on a future stuck behind it in the queue: a genuine
circular-wait deadlock, not merely a slow drain. That it was a real hang and
not slowness was confirmed via ``faulthandler.dump_traceback_later``:
repeated all-thread dumps showed every pool worker parked at
``prev.result()`` or ``concurrent.futures.wait(futs)`` with no progress
across dump intervals of 5-50s. Plain (non-``DeltaChannel``) graphs never hit
this: only a ``DeltaChannel`` write appends to ``_delta_write_futs``, so only
they added the second, execution-time-captured wait that made the inversion
possible.

Hangs started around ``steps`` in the low 40s against a 14-worker default
pool (10 CPUs), intermittently rather than deterministically at any fixed
step count -- consistent with a scheduling race rather than a fixed depth
threshold. No formula relating chain depth, pool size, and hang probability
was derived or verified; "roughly 3x the observed pool size was enough to
hang here" was one machine's observation.

**The fix, and why there is no longer a workaround here.** Reported as
``langchain-ai/langgraph#9270`` and fixed by ``#9235``, first carried by the
``1.2.15`` release. ``_checkpointer_put_after_previous`` now takes a
``delta_write_futs`` argument -- the futures captured when the save was
submitted -- instead of draining the shared list when a worker picks the save
up, so a save can no longer wait on a write queued behind it. While this lab
pinned ``1.2.11`` these measurements ran with ``max_concurrency`` set on the
``invoke`` config below, which raised the pool above any chain depth the step
counts reach. The pin is ``1.2.16`` and that line is gone: with nothing
passed, this sweep completed 5 runs of 5 and the lab's delta graph completed
10 of 10 at 60 steps and 5 of 5 at 100 steps, on ``1.2.15`` and ``1.2.16``
alike -- against 0 of 3 at 60 steps on the old pin. Checked on a small
executor too, since CI runners have few cores and fewer workers is the worse
condition for an order inversion: capping the pool at 2 workers, 100 steps
completed 3 of 3 on ``1.2.16`` and 0 of 2 on ``1.2.11``.

Note for anyone re-introducing a cap: it would only ever belong on ``invoke``,
not on ``get_state``. ``Pregel._prepare_state_snapshot`` (what ``get_state``
calls into) never constructs a ``BackgroundExecutor`` -- it runs
``channels_from_checkpoint``, ``prepare_next_tasks``, and
``dict(get_subgraphs())`` synchronously on the calling thread, so a cap there
is inert.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver

from checkpoint_cost.graphs import build_delta


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
    base_config: RunnableConfig = {
        "configurable": {"thread_id": f"resume-{steps}-{snapshot_frequency}"}
    }
    compiled.invoke({"items": [], "remaining": steps}, base_config)

    # A fresh compile against the same saver: nothing from the first run's
    # compiled graph or its channels is reachable here, so the only thing the
    # two runs share is the serialized checkpoint history in `saver`. The
    # timing below is reconstruction through DeltaChannel's reducer replay
    # (plus the fixed get_state overhead described in the module docstring),
    # not a cache hit.
    reader = build_delta(
        payload_bytes=payload_bytes, snapshot_frequency=snapshot_frequency
    ).compile(checkpointer=saver)
    start = time.perf_counter()
    state = reader.get_state(base_config)
    elapsed = time.perf_counter() - start

    return ResumeResult(
        steps=steps,
        snapshot_frequency=snapshot_frequency,
        reconstruct_seconds=elapsed,
        item_count=len(state.values["items"]),
    )
