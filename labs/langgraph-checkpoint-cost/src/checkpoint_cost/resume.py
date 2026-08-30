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

**A real deadlock in langgraph 1.2.11's DeltaChannel write path, and why
``max_concurrency`` is set on the ``invoke`` call below.** Every superstep
submits a ``checkpointer.put_writes`` future to a bounded
``ThreadPoolExecutor`` (sized ``min(32, os.cpu_count() + 4)`` by default,
via LangChain's ``get_executor_for_config``) -- the *same* pool node
execution itself is submitted to (``pregel/_runner.py``'s task-scheduling
loop calls ``self.submit()``, i.e. the same ``BackgroundExecutor``). When a
step writes to a ``DeltaChannel``, its ``put_writes`` future is *also*
appended to ``self._delta_write_futs``
(``pregel/_loop.py:495-498``). Separately, each step's checkpoint ``put`` is
chained through ``_checkpointer_put_after_previous``
(``_loop.py:1530-1547``): it is submitted to the same pool and, once running,
waits on ``prev.result()`` where ``prev`` is the *previous* step's own
checkpoint-put future.

That ``prev.result()`` chain alone cannot deadlock a strictly-FIFO pool: each
task's ``prev`` was necessarily submitted earlier, so the earliest task in
the chain has nothing left to wait on, must eventually get a worker, and
unblocks the next one in turn. The actual deadlock condition is an *order
inversion*, and it's specific to ``DeltaChannel``: before waiting on
``prev``, ``_checkpointer_put_after_previous`` also drains and waits on
``self._delta_write_futs``
(``futs, self._delta_write_futs = self._delta_write_futs, []`` then
``concurrent.futures.wait(futs)``, ``_loop.py:1538-1540``) -- and it drains
whatever is in that list *at execution time*, not at the time this task was
itself submitted. Because the main loop keeps advancing (submitting new
steps' ``put_writes`` futures into ``_delta_write_futs``) while earlier
``_checkpointer_put_after_previous`` calls are still queued waiting for a
free worker, a task that finally gets a worker can find ``_delta_write_futs``
holding futures that were submitted to the pool *after* this task itself
was -- i.e. a task can end up occupying a worker while waiting on another
task that is queued behind it. With enough such tasks queued at once (and
node-execution futures also competing for the same pool), every worker can
simultaneously be parked waiting on a future that is stuck behind it in the
queue: a genuine circular-wait deadlock, not merely a slow drain. I confirmed
this is a real hang, not slowness, via ``faulthandler.dump_traceback_later``:
repeated all-thread dumps showed every pool worker parked at
``_loop.py:1543`` (``prev.result()``) or ``_loop.py:1540``
(``concurrent.futures.wait(futs)``) with no progress across dump intervals of
5-50s. Plain (non-``DeltaChannel``) graphs never hit this in testing: only a
``DeltaChannel`` write appends to ``_delta_write_futs``, so only they add the
second, execution-time-captured wait that makes the inversion possible.

I observed hangs starting around ``steps`` in the low 40s against this
machine's 14-worker default pool (10 CPUs), intermittently rather than
deterministically at any fixed step count -- consistent with a scheduling
race rather than a fixed depth threshold. I have not derived (or verified)
a formula relating chain depth, pool size, and hang probability; "roughly
3x the observed pool size was enough to hang here" is one machine's
observation, not a rule this module relies on. Passing ``max_concurrency``
in the ``invoke`` config raises the pool size to a value chosen well above
any chain depth this lab's step counts reach -- not exhaustively
stress-tested against arbitrarily large step counts -- which reproducibly
avoided the deadlock across 60/60 fresh runs at ``steps=60`` in local
testing (vs. failures within the first ~5 of 30 runs with no
``max_concurrency`` set). See the Task 4 report for the full reproduction,
and for a search of the langgraph issue tracker for this specific bug.

``max_concurrency`` is set only on the ``invoke`` config below, not on
``get_state``'s: ``Pregel._prepare_state_snapshot`` (what ``get_state`` calls
into) never constructs a ``BackgroundExecutor`` -- it runs
``channels_from_checkpoint``, ``prepare_next_tasks``, and
``dict(get_subgraphs())`` synchronously on the calling thread. Setting
``max_concurrency`` there would be inert.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver

from checkpoint_cost.graphs import build_delta

# Chosen well above any checkpoint-put future chain depth this lab's step
# counts reach, to avoid the DeltaChannel thread-pool deadlock described in
# the module docstring. Only meaningful on `invoke` -- see docstring.
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
    base_config: RunnableConfig = {
        "configurable": {"thread_id": f"resume-{steps}-{snapshot_frequency}"}
    }
    invoke_config: RunnableConfig = {**base_config, "max_concurrency": _MAX_CONCURRENCY}
    compiled.invoke({"items": [], "remaining": steps}, invoke_config)

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
