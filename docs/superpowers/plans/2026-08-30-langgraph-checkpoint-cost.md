# LangGraph checkpoint cost lab — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `labs/langgraph-checkpoint-cost`, which measures what checkpointing an accumulating
LangGraph state actually costs — on the write path and, crucially, on the read path where
`DeltaChannel` sends that cost.

**Architecture:** A checkpointer wrapper that delegates to a real `InMemorySaver` while recording
bytes serialized and serialize time per step. Three graph fixtures (accumulating, non-accumulating
control, accumulating-with-`DeltaChannel`) run over a swept range of step counts. Resume cost is
measured separately by reconstructing a thread at a given step and timing it, swept across
`snapshot_frequency`.

**Tech Stack:** Python 3.12+, `langgraph==1.2.11`, pytest, ruff, mypy --strict.

**Spec:** `docs/superpowers/specs/2026-08-30-langgraph-checkpoint-cost-design.md`

## Global Constraints

- **Pin `langgraph==1.2.11`.** The version the Reference lookup was verified against.
- **No model is ever called.** Nodes are deterministic functions returning configured payload sizes.
- **No network in tests.** The pinned dependency is installed; nothing reaches a service.
- **No expected numbers in assertions.** Tests assert _shape_ (flat vs. growing, one side vs. the
  other), never a specific byte count or duration. Machine-specific magnitudes must not gate CI.
- **Gates are `ruff`, `mypy --strict`, `pytest`** and every task runs all three before committing —
  a gate that only runs at the end catches nothing until the end.
- **`mypy` covers `src` _and_ `tests`.** The other eleven labs run `mypy src`, which leaves test code
  unchecked; type errors in tests are how a suite quietly stops asserting what it claims to. This lab
  runs `mypy src tests`. Note the deviation in the README.
- **SQLite is out of v1.** `langgraph.checkpoint.sqlite` is not in the core distribution (verified:
  `ModuleNotFoundError` on `langgraph==1.2.11`), so per the spec the disk configuration is dropped
  and the Build page says the numbers exclude disk.
- **`DeltaChannel` is beta.** Every page written about this lab says so.

## Verified API surface

Confirmed against an installed `langgraph==1.2.11`. Do not substitute from memory; if something here
fails, re-inspect rather than guess.

```text
from langgraph.graph import StateGraph, START, END
from langgraph.channels import DeltaChannel
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.types import interrupt, Command

DeltaChannel(reducer, typ=None, *, snapshot_frequency: int = 1000)
    reducer signature: (state, list[writes]) -> new_state
    used as: Annotated[T, DeltaChannel(...)]
BaseCheckpointSaver.put(config, checkpoint, metadata, new_versions) -> RunnableConfig
BaseCheckpointSaver.put_writes(config, writes, task_id, task_path="") -> None
BaseCheckpointSaver.get_tuple(config) -> CheckpointTuple | None
BaseCheckpointSaver.serde.dumps_typed(obj) -> tuple[str, bytes]
interrupt(value: Any) -> Any
```

## File structure

| File                                     | Responsibility                                              |
| ---------------------------------------- | ----------------------------------------------------------- |
| `pyproject.toml`                         | Pins, ruff/mypy config, dev extra                           |
| `src/checkpoint_cost/measuring_saver.py` | The instrument: wraps a saver, records per-step cost        |
| `src/checkpoint_cost/graphs.py`          | The three graph fixtures                                    |
| `src/checkpoint_cost/sweep.py`           | Runs a fixture over step counts; write-path results         |
| `src/checkpoint_cost/resume.py`          | Reconstruct-on-resume timing, swept over snapshot_frequency |
| `src/checkpoint_cost/report.py`          | Formats both tables                                         |
| `src/checkpoint_cost/cli.py`             | `measure` entry point                                       |
| `tests/test_measuring_saver.py`          | The instrument is correct                                   |
| `tests/test_write_path.py`               | Headline write-path finding + the meta-test                 |
| `tests/test_read_path.py`                | Resume cost and the snapshot_frequency dial                 |
| `tests/test_semantics.py`                | Interrupt/resume, non-associative reducer, node retry       |
| `README.md`                              | What it measures, how to run, what is simulated             |

---

### Task 1: Project scaffold and the measuring saver

**Files:**

- Create: `labs/langgraph-checkpoint-cost/pyproject.toml`
- Create: `labs/langgraph-checkpoint-cost/src/checkpoint_cost/__init__.py`
- Create: `labs/langgraph-checkpoint-cost/src/checkpoint_cost/measuring_saver.py`
- Test: `labs/langgraph-checkpoint-cost/tests/test_measuring_saver.py`

**Interfaces:**

- Consumes: nothing.
- Produces: `StepCost(step: int, bytes_serialized: int, serialize_seconds: float)` and
  `MeasuringSaver(inner: BaseCheckpointSaver)` exposing `.costs: list[StepCost]`. Every later task
  uses both.

- [ ] **Step 1: Create `pyproject.toml`**

```toml
[project]
name = "checkpoint-cost"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["langgraph==1.2.11"]

[project.optional-dependencies]
dev = ["pytest>=8", "ruff>=0.6", "mypy>=1.11"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.mypy]
strict = true

[tool.ruff]
line-length = 100
```

- [ ] **Step 2: Create the venv and install**

```bash
cd labs/langgraph-checkpoint-cost
uv venv .venv && uv pip install --python .venv/bin/python -e '.[dev]'
```

- [ ] **Step 3: Write the failing test**

```python
# tests/test_measuring_saver.py
from langgraph.checkpoint.memory import InMemorySaver
from checkpoint_cost.measuring_saver import MeasuringSaver


def test_records_one_cost_entry_per_put() -> None:
    saver = MeasuringSaver(InMemorySaver())
    config = {"configurable": {"thread_id": "t1", "checkpoint_ns": ""}}
    checkpoint = {"v": 1, "id": "c1", "ts": "2026-01-01T00:00:00+00:00", "channel_values": {"x": 1}}

    saver.put(config, checkpoint, {}, {})  # type: ignore[arg-type]

    assert len(saver.costs) == 1
    assert saver.costs[0].bytes_serialized > 0
    assert saver.costs[0].step == 0


def test_larger_state_serializes_to_more_bytes() -> None:
    saver = MeasuringSaver(InMemorySaver())
    config = {"configurable": {"thread_id": "t1", "checkpoint_ns": ""}}
    small = {"v": 1, "id": "a", "ts": "t", "channel_values": {"x": [0] * 10}}
    large = {"v": 1, "id": "b", "ts": "t", "channel_values": {"x": [0] * 1000}}

    saver.put(config, small, {}, {})  # type: ignore[arg-type]
    saver.put(config, large, {}, {})  # type: ignore[arg-type]

    assert saver.costs[1].bytes_serialized > saver.costs[0].bytes_serialized
```

- [ ] **Step 4: Run it and watch it fail**

Run: `./.venv/bin/python -m pytest tests/test_measuring_saver.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'checkpoint_cost.measuring_saver'`

- [ ] **Step 5: Implement the saver**

```python
# src/checkpoint_cost/measuring_saver.py
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
class MeasuringSaver(BaseCheckpointSaver):  # type: ignore[type-arg]
    """Delegates to a real saver, recording the cost of every write.

    Serializes with the inner saver's own serializer so the measurement is of
    LangGraph's serialization strategy, not of a stand-in.
    """

    inner: BaseCheckpointSaver
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
```

> If `mypy --strict` reports an unimplemented abstract method, add it as a delegating passthrough in
> the same shape. Do not silence it with `# type: ignore` on the class.

- [ ] **Step 6: Run the gates**

```bash
./.venv/bin/python -m ruff check . && \
./.venv/bin/python -m mypy src tests && \
./.venv/bin/python -m pytest -q
```

Expected: ruff clean, mypy clean, both tests pass.

- [ ] **Step 7: Commit**

```bash
git add labs/langgraph-checkpoint-cost
git commit -m "feat(lab): measure what a LangGraph checkpoint write costs"
```

---

### Task 2: The three graph fixtures

**Files:**

- Create: `labs/langgraph-checkpoint-cost/src/checkpoint_cost/graphs.py`
- Test: `labs/langgraph-checkpoint-cost/tests/test_graphs.py`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `build_accumulating(payload_bytes: int)`, `build_non_accumulating(payload_bytes: int)`,
  and `build_delta(payload_bytes: int, snapshot_frequency: int)` — each returning an uncompiled
  `StateGraph`. Tasks 3 and 4 compile these with a checkpointer.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_graphs.py
from checkpoint_cost.graphs import build_accumulating, build_delta, build_non_accumulating
from langgraph.checkpoint.memory import InMemorySaver


def _run(graph, steps: int):
    compiled = graph.compile(checkpointer=InMemorySaver())
    config = {"configurable": {"thread_id": "t"}}
    return compiled.invoke({"items": [], "remaining": steps}, config)


def test_accumulating_state_grows_with_steps() -> None:
    short = _run(build_accumulating(payload_bytes=64), steps=3)
    long = _run(build_accumulating(payload_bytes=64), steps=9)
    assert len(long["items"]) > len(short["items"])


def test_non_accumulating_state_stays_one_item() -> None:
    result = _run(build_non_accumulating(payload_bytes=64), steps=9)
    assert len(result["items"]) == 1


def test_delta_graph_reaches_the_same_state_as_accumulating() -> None:
    plain = _run(build_accumulating(payload_bytes=64), steps=5)
    delta = _run(build_delta(payload_bytes=64, snapshot_frequency=1000), steps=5)
    assert len(delta["items"]) == len(plain["items"])
```

- [ ] **Step 2: Run it and watch it fail**

Run: `./.venv/bin/python -m pytest tests/test_graphs.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'checkpoint_cost.graphs'`

- [ ] **Step 3: Implement the fixtures**

```python
# src/checkpoint_cost/graphs.py
"""Three graphs that differ in exactly one dimension: how state accumulates.

No model is called. Each node appends a fixed-size payload, so state size is a
function of step count and nothing else -- which is what makes the cost curve
reproducible.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, Sequence, TypedDict

from langgraph.channels import DeltaChannel
from langgraph.graph import END, START, StateGraph


class AccumulatingState(TypedDict):
    items: Annotated[list[str], operator.add]
    remaining: int


class ReplacingState(TypedDict):
    items: list[str]
    remaining: int


def _payload(payload_bytes: int) -> str:
    return "x" * payload_bytes


def _step(payload_bytes: int):
    def node(state: Any) -> dict[str, Any]:
        return {"items": [_payload(payload_bytes)], "remaining": state["remaining"] - 1}

    return node


def _should_continue(state: Any) -> str:
    return "work" if state["remaining"] > 0 else END


def _wire(graph: StateGraph, payload_bytes: int) -> StateGraph:
    graph.add_node("work", _step(payload_bytes))
    graph.add_edge(START, "work")
    graph.add_conditional_edges("work", _should_continue, {"work": "work", END: END})
    return graph


def build_accumulating(payload_bytes: int) -> StateGraph:
    """State grows every step. The shape the Reference lookup warns about."""
    return _wire(StateGraph(AccumulatingState), payload_bytes)


def build_non_accumulating(payload_bytes: int) -> StateGraph:
    """The control. State is replaced each step and stays one item."""

    graph = StateGraph(ReplacingState)
    graph.add_node("work", _step(payload_bytes))
    graph.add_edge(START, "work")
    graph.add_conditional_edges("work", _should_continue, {"work": "work", END: END})
    return graph


def _append(state: list[str] | None, writes: Sequence[Any]) -> list[str]:
    """Batching-invariant by construction: concatenation is associative."""
    current = list(state or [])
    for write in writes:
        current.extend(write)
    return current


def build_delta(payload_bytes: int, snapshot_frequency: int) -> StateGraph:
    """The same growth, through the channel the lookup recommends."""

    class DeltaState(TypedDict):
        items: Annotated[
            list[str], DeltaChannel(_append, list, snapshot_frequency=snapshot_frequency)
        ]
        remaining: int

    return _wire(StateGraph(DeltaState), payload_bytes)
```

> `_step` returns `{"items": [payload]}` in every fixture. For the accumulating and delta graphs the
> channel merges it; for the replacing graph it overwrites. That is the only difference between them,
> which is what makes the control a real control.

- [ ] **Step 4: Run the tests**

Run: `./.venv/bin/python -m pytest tests/test_graphs.py -v`
Expected: PASS. If `DeltaChannel`'s `typ` argument is rejected positionally, pass it as a keyword —
confirm against the installed build rather than guessing.

- [ ] **Step 5: Run the gates**

```bash
./.venv/bin/python -m ruff check . && \
./.venv/bin/python -m mypy src tests && \
./.venv/bin/python -m pytest -q
```

- [ ] **Step 6: Commit**

```bash
git add labs/langgraph-checkpoint-cost
git commit -m "feat(lab): three graphs differing only in how state accumulates"
```

---

### Task 3: The write-path sweep, and the meta-test

**Files:**

- Create: `labs/langgraph-checkpoint-cost/src/checkpoint_cost/sweep.py`
- Test: `labs/langgraph-checkpoint-cost/tests/test_write_path.py`

**Interfaces:**

- Consumes: `MeasuringSaver`, `StepCost` (Task 1); the three `build_*` functions (Task 2).
- Produces: `WriteResult(steps, total_bytes, final_step_bytes, per_step)` and
  `sweep_write_path(builder, step_counts, payload_bytes) -> list[WriteResult]`. Task 6 formats these.

- [ ] **Step 1: Write the failing test — the meta-test first**

```python
# tests/test_write_path.py
from checkpoint_cost.graphs import build_accumulating, build_non_accumulating
from checkpoint_cost.sweep import sweep_write_path

STEPS = [5, 10, 20]


def test_a_non_accumulating_graph_shows_flat_cost() -> None:
    """The meta-test. If this fails, every other number here is unattributable.

    A rising curve for a graph whose state never grows means the harness is
    measuring step overhead or its own bookkeeping, and "cost grows with run
    length" would be true by construction.
    """
    results = sweep_write_path(build_non_accumulating, STEPS, payload_bytes=64)
    first, last = results[0].final_step_bytes, results[-1].final_step_bytes
    assert last < first * 1.5


def test_an_accumulating_graph_does_not_show_flat_cost() -> None:
    """The meta-test's twin. A harness that cannot detect growth is equally useless."""
    results = sweep_write_path(build_accumulating, STEPS, payload_bytes=64)
    assert results[-1].final_step_bytes > results[0].final_step_bytes * 1.5


def test_cumulative_bytes_grow_faster_than_step_count_when_state_accumulates() -> None:
    results = sweep_write_path(build_accumulating, STEPS, payload_bytes=64)
    ratio_steps = results[-1].steps / results[0].steps
    ratio_bytes = results[-1].total_bytes / results[0].total_bytes
    assert ratio_bytes > ratio_steps
```

- [ ] **Step 2: Run it and watch it fail**

Run: `./.venv/bin/python -m pytest tests/test_write_path.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'checkpoint_cost.sweep'`

- [ ] **Step 3: Implement the sweep**

```python
# src/checkpoint_cost/sweep.py
"""Run a fixture at several lengths, because one length proves nothing.

A single run cannot distinguish linear growth from superlinear growth, and
that distinction is the whole finding.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

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
    builder: Callable[..., StateGraph],
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
```

- [ ] **Step 4: Run the tests**

Run: `./.venv/bin/python -m pytest tests/test_write_path.py -v`
Expected: PASS.

> **If `test_an_accumulating_graph_does_not_show_flat_cost` fails, stop and report it.** That is the
> Reference lookup's claim failing to reproduce, which is a finding, not a bug to code around. Do not
> adjust the threshold to make it pass.

- [ ] **Step 5: Run the gates, then commit**

```bash
./.venv/bin/python -m ruff check . && \
./.venv/bin/python -m mypy src tests && \
./.venv/bin/python -m pytest -q
git add labs/langgraph-checkpoint-cost
git commit -m "feat(lab): sweep the write path, and prove the harness can show flat"
```

---

### Task 4: The read path — where DeltaChannel sends the cost

**Files:**

- Create: `labs/langgraph-checkpoint-cost/src/checkpoint_cost/resume.py`
- Test: `labs/langgraph-checkpoint-cost/tests/test_read_path.py`

**Interfaces:**

- Consumes: `build_delta`, `build_accumulating` (Task 2).
- Produces: `ResumeResult(steps, snapshot_frequency, reconstruct_seconds)` and
  `measure_resume(steps, snapshot_frequency, payload_bytes) -> ResumeResult`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_read_path.py
from checkpoint_cost.resume import measure_resume


def test_lower_snapshot_frequency_reconstructs_faster() -> None:
    """snapshot_frequency is the dial between write cost and resume cost.

    Frequent snapshots mean shallower replay. If this does not hold, the dial
    does not do what its docstring says and the Build page must report that.
    """
    frequent = measure_resume(steps=60, snapshot_frequency=5, payload_bytes=256)
    rare = measure_resume(steps=60, snapshot_frequency=10_000, payload_bytes=256)
    assert frequent.reconstruct_seconds <= rare.reconstruct_seconds


def test_resume_returns_the_state_the_run_ended_with() -> None:
    result = measure_resume(steps=20, snapshot_frequency=5, payload_bytes=64)
    assert result.item_count == 20
```

- [ ] **Step 2: Run it and watch it fail**

Run: `./.venv/bin/python -m pytest tests/test_read_path.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'checkpoint_cost.resume'`

- [ ] **Step 3: Implement resume measurement**

```python
# src/checkpoint_cost/resume.py
"""What it costs to get state back.

DeltaChannel stores a sentinel and reconstructs by replaying ancestor writes
through the reducer, snapshotting every `snapshot_frequency` updates. So the
cost does not disappear -- it moves here. Measuring only the write path would
report the channel as free.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

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
    config = {"configurable": {"thread_id": f"resume-{steps}-{snapshot_frequency}"}}
    compiled.invoke({"items": [], "remaining": steps}, config)

    # A fresh compile against the same saver: nothing is warm, so the timing is
    # reconstruction rather than cache.
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
```

- [ ] **Step 4: Run the tests**

Run: `./.venv/bin/python -m pytest tests/test_read_path.py -v`
Expected: PASS.

> Timing comparisons are inherently noisy. If `test_lower_snapshot_frequency_reconstructs_faster`
> proves flaky, raise `steps` and `payload_bytes` to widen the gap rather than loosening the
> assertion into meaninglessness. If it fails _consistently_, that is a finding — report it.

- [ ] **Step 5: Run the gates, then commit**

```bash
./.venv/bin/python -m ruff check . && \
./.venv/bin/python -m mypy src tests && \
./.venv/bin/python -m pytest -q
git add labs/langgraph-checkpoint-cost
git commit -m "feat(lab): measure the resume cost DeltaChannel trades for"
```

---

### Task 5: The semantics the tests pin

**Files:**

- Test: `labs/langgraph-checkpoint-cost/tests/test_semantics.py`
- Modify: `labs/langgraph-checkpoint-cost/src/checkpoint_cost/graphs.py` (add two fixtures)

**Interfaces:**

- Consumes: everything from Task 2.
- Produces: `build_approval_graph()` and `build_non_associative_delta(payload_bytes)`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_semantics.py
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from checkpoint_cost.graphs import build_approval_graph, build_non_associative_delta


def test_interrupt_and_resume_are_one_mechanism() -> None:
    """Module 7's central claim, which nothing in this repo proved before now.

    The run pauses for a human and is resumed from its checkpoint. The same
    resumption path serves a crash, because to the graph they are the same
    event: state exists, execution does not.
    """
    graph = build_approval_graph().compile(checkpointer=InMemorySaver())
    config = {"configurable": {"thread_id": "approval"}}

    first = graph.invoke({"approved": False, "log": []}, config)
    assert "__interrupt__" in first

    resumed = graph.invoke(Command(resume=True), config)
    assert resumed["approved"] is True
    assert resumed["log"] == ["requested", "granted"]


def test_a_non_associative_reducer_reconstructs_different_state() -> None:
    """DeltaChannel requires a batching-invariant reducer and cannot check it.

    Replay folds writes in larger batches than they were produced in, so a
    reducer that is sensitive to batching returns something else after a
    resume -- with no error raised anywhere.
    """
    saver = InMemorySaver()
    graph = build_non_associative_delta(payload_bytes=8).compile(checkpointer=saver)
    config = {"configurable": {"thread_id": "assoc"}}

    live = graph.invoke({"items": [], "remaining": 12}, config)

    reader = build_non_associative_delta(payload_bytes=8).compile(checkpointer=saver)
    reconstructed = reader.get_state(config).values

    assert reconstructed["items"] != live["items"]
```

- [ ] **Step 2: Run and watch them fail**

Run: `./.venv/bin/python -m pytest tests/test_semantics.py -v`
Expected: FAIL — `ImportError: cannot import name 'build_approval_graph'`

- [ ] **Step 3: Add the two fixtures to `graphs.py`**

```python
def build_approval_graph() -> StateGraph:
    """A run that pauses for a human. Resuming it is resuming from a checkpoint."""

    class ApprovalState(TypedDict):
        approved: bool
        log: Annotated[list[str], operator.add]

    def request(state: Any) -> dict[str, Any]:
        return {"log": ["requested"]}

    def gate(state: Any) -> dict[str, Any]:
        granted = interrupt({"question": "approve?"})
        return {"approved": bool(granted), "log": ["granted" if granted else "denied"]}

    graph = StateGraph(ApprovalState)
    graph.add_node("request", request)
    graph.add_node("gate", gate)
    graph.add_edge(START, "request")
    graph.add_edge("request", "gate")
    graph.add_edge("gate", END)
    return graph


def _non_associative(state: list[str] | None, writes: Sequence[Any]) -> list[str]:
    """Deliberately batching-sensitive: it records how many writes arrived at once.

    Concatenation is associative; tagging a batch with its own size is not.
    """
    current = list(state or [])
    for write in writes:
        current.extend(write)
    current.append(f"batch:{len(writes)}")
    return current


def build_non_associative_delta(payload_bytes: int) -> StateGraph:
    class BadDeltaState(TypedDict):
        items: Annotated[list[str], DeltaChannel(_non_associative, list, snapshot_frequency=10_000)]
        remaining: int

    return _wire(StateGraph(BadDeltaState), payload_bytes)
```

Add `from langgraph.types import interrupt` to the imports at the top of `graphs.py`.

- [ ] **Step 4: Run the tests**

Run: `./.venv/bin/python -m pytest tests/test_semantics.py -v`
Expected: PASS.

> If the non-associative test does _not_ diverge, LangGraph may be replaying writes one at a time at
> this scale. Raise `remaining` and lower `snapshot_frequency`'s influence by keeping it high, so
> replay depth is large. If it still holds, record that on the Build page — it would mean the
> batching-invariance requirement is stricter than the runtime's actual behaviour, which is worth
> saying.

- [ ] **Step 5: Run the gates, then commit**

```bash
./.venv/bin/python -m ruff check . && \
./.venv/bin/python -m mypy src tests && \
./.venv/bin/python -m pytest -q
git add labs/langgraph-checkpoint-cost
git commit -m "feat(lab): pin interrupt/resume equivalence and the silent reducer trap"
```

---

### Task 6: The `measure` entry point and README

**Files:**

- Create: `labs/langgraph-checkpoint-cost/src/checkpoint_cost/report.py`
- Create: `labs/langgraph-checkpoint-cost/src/checkpoint_cost/cli.py`
- Create: `labs/langgraph-checkpoint-cost/README.md`
- Test: `labs/langgraph-checkpoint-cost/tests/test_report.py`

**Interfaces:**

- Consumes: `WriteResult` (Task 3), `ResumeResult` (Task 4).
- Produces: `format_write_table(results) -> str`, `format_resume_table(results) -> str`, `main() -> None`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_report.py
from checkpoint_cost.measuring_saver import StepCost
from checkpoint_cost.report import format_write_table
from checkpoint_cost.sweep import WriteResult


def test_table_has_one_row_per_sweep_point() -> None:
    results = [
        WriteResult(steps=10, total_bytes=100, final_step_bytes=20, per_step=[StepCost(0, 20, 0.1)]),
        WriteResult(steps=20, total_bytes=400, final_step_bytes=40, per_step=[StepCost(0, 40, 0.2)]),
    ]
    table = format_write_table(results)
    assert "10" in table and "20" in table
    assert len(table.strip().splitlines()) == 3  # header + two rows
```

- [ ] **Step 2: Run it and watch it fail**

Run: `./.venv/bin/python -m pytest tests/test_report.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'checkpoint_cost.report'`

- [ ] **Step 3: Implement the report and CLI**

```python
# src/checkpoint_cost/report.py
"""Formats what was measured. Holds no opinion about what the numbers should be."""

from __future__ import annotations

from checkpoint_cost.resume import ResumeResult
from checkpoint_cost.sweep import WriteResult


def format_write_table(results: list[WriteResult]) -> str:
    lines = [f"{'steps':>6}  {'total bytes':>12}  {'final step bytes':>17}"]
    for r in results:
        lines.append(f"{r.steps:>6}  {r.total_bytes:>12}  {r.final_step_bytes:>17}")
    return "\n".join(lines)


def format_resume_table(results: list[ResumeResult]) -> str:
    lines = [f"{'steps':>6}  {'snapshot freq':>14}  {'reconstruct ms':>15}"]
    for r in results:
        lines.append(f"{r.steps:>6}  {r.snapshot_frequency:>14}  {r.reconstruct_seconds * 1000:>15.2f}")
    return "\n".join(lines)
```

```python
# src/checkpoint_cost/cli.py
"""One command that prints both halves of the trade."""

from __future__ import annotations

from checkpoint_cost.graphs import build_accumulating, build_delta, build_non_accumulating
from checkpoint_cost.report import format_resume_table, format_write_table
from checkpoint_cost.resume import measure_resume
from checkpoint_cost.sweep import sweep_write_path

STEP_COUNTS = [10, 25, 50, 100]
PAYLOAD = 256


def main() -> None:
    print("\naccumulating (full state re-serialized every step)")
    print(format_write_table(sweep_write_path(build_accumulating, STEP_COUNTS, PAYLOAD)))

    print("\nnon-accumulating (the control)")
    print(format_write_table(sweep_write_path(build_non_accumulating, STEP_COUNTS, PAYLOAD)))

    print("\naccumulating with DeltaChannel")
    print(
        format_write_table(
            sweep_write_path(build_delta, STEP_COUNTS, PAYLOAD, snapshot_frequency=1000)
        )
    )

    print("\nresume cost, swept over snapshot_frequency")
    print(
        format_resume_table(
            [measure_resume(steps=100, snapshot_frequency=f, payload_bytes=PAYLOAD)
             for f in (5, 25, 100, 10_000)]
        )
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run it for real and capture the output**

```bash
./.venv/bin/python -m checkpoint_cost.cli
```

Save the output — Task 8's Build page publishes these numbers, and they must be the ones this run
produced rather than any written in advance.

- [ ] **Step 5: Write the README**

Cover: what the lab measures, the two-sided trade, that `DeltaChannel` is beta, that no model is
called, that SQLite/disk is excluded and why, that `mypy` covers tests as well as `src`, and the
three commands to run it.

- [ ] **Step 6: Run the gates, then commit**

```bash
./.venv/bin/python -m ruff check . && \
./.venv/bin/python -m mypy src tests && \
./.venv/bin/python -m pytest -q
git add labs/langgraph-checkpoint-cost
git commit -m "feat(lab): one command that prints both halves of the trade"
```

---

### Task 7: CI workflow

**Files:**

- Create: `.github/workflows/lab-langgraph-checkpoint-cost-ci.yml`

**Interfaces:**

- Consumes: the lab's three gates.
- Produces: a badge-able workflow, matching the existing lab workflows.

- [ ] **Step 1: Read an existing lab workflow and copy its shape**

```bash
cat .github/workflows/lab-async-ai-gateway-ci.yml
```

Match its trigger paths, Python version, and step naming. Do not invent a different shape — the
repository has eleven of these and consistency is the point.

- [ ] **Step 2: Write the workflow**

Trigger on pushes and pull requests touching `labs/langgraph-checkpoint-cost/**` and the workflow
file itself. Install with `uv`, then run, as three separate named steps so a failure names itself:

```yaml
- name: ruff
  run: ./.venv/bin/python -m ruff check .
- name: mypy
  run: ./.venv/bin/python -m mypy src tests
- name: pytest
  run: ./.venv/bin/python -m pytest -q
```

> Note the `install` step must not use `--dependency-extra` shorthand that omits `dev`. The
> `async-ai-gateway` lab shipped labelled `production-ready` while its CI omitted an extra, so test
> collection aborted before anything ran and masked 13 type errors and a failing test. Confirm the
> workflow actually runs the tests by checking the run's log for a pytest summary line.

- [ ] **Step 3: Verify the gates pass locally exactly as CI runs them**

```bash
cd labs/langgraph-checkpoint-cost && \
./.venv/bin/python -m ruff check . && \
./.venv/bin/python -m mypy src tests && \
./.venv/bin/python -m pytest -q
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/lab-langgraph-checkpoint-cost-ci.yml
git commit -m "ci: gate the checkpoint-cost lab on ruff, mypy, and its tests"
```

---

### Task 8: Build page and roadmap update

**Files:**

- Create: `apps/handbook/src/content/docs/build/labs/langgraph-checkpoint-cost.mdx`
- Modify: `apps/handbook/src/content/docs/build/index.mdx`
- Modify: `apps/handbook/src/content/docs/roadmap.mdx`
- Modify: `apps/handbook/src/content/docs/learn/modules/07-langgraph.mdx` (Hands-on Lab section)
- Modify: `packages/handbook-content/src/collections.ts` (`lab: 11` → `12`)

**Interfaces:**

- Consumes: the measured output from Task 6, Step 4.
- Produces: a published Build page.

- [ ] **Step 1: Write the Build page**

Follow the shape of `build/labs/model-router.mdx`. Frontmatter needs `category: lab`,
`repoPath: labs/langgraph-checkpoint-cost`, `labStatus`, and — because the path contains `langgraph`,
which is on the linter's fast-moving list — a `freshness` block:

```yaml
freshness:
  classification: fast-moving
  verifiedAgainst: "langgraph==1.2.11, API surface inspected on an installed build"
  verifiedOn: 2026-08-30
```

Include an `<Aside type="caution">` stating what is simulated: no model is called, disk is excluded
because the SQLite checkpointer is a separate distribution, and `DeltaChannel` is beta with an
explicitly unstable on-disk contract.

Publish the measured tables from Task 6. If the measurement contradicted the Reference lookup's
claim, say so directly and in the page's own voice — `model-router` is the precedent for how that
reads.

- [ ] **Step 2: Add the lab to `build/index.mdx`**

Match the existing table's column shape and keep the list alphabetical if it already is.

- [ ] **Step 3: Update Module 7's Hands-on Lab section**

Replace "No dedicated LangGraph lab exists yet — see the Roadmap for what's planned." with a
`<LabCallout>` pointing at the new page. Keep the existing `<Exercise>`.

- [ ] **Step 4: Raise the lab floor**

In `packages/handbook-content/src/collections.ts`, change `lab: 11` to `lab: 12`. That constant is a
floor that catches a collection loading short; leaving it behind means it stops noticing a loss.

- [ ] **Step 5: Update the roadmap**

Record the lab as shipped, and state plainly that its Architecture page and its episode do not exist
yet — the roadmap's job is to say what is missing, and a silent gap here is the exact drift this
roadmap has already had to correct once.

- [ ] **Step 6: Run the full repository verification**

```bash
pnpm verify
```

Expected: exit 0. `lint:content` will fail if the Build page is missing its freshness block, which is
the linter doing its job.

- [ ] **Step 7: Commit**

```bash
git add apps packages docs
git commit -m "feat(handbook): publish the checkpoint-cost lab"
```

---

## Self-review

**Spec coverage.** Cost-curve shape → Task 3. `DeltaChannel` write-path cost → Task 3 (delta sweep in
Task 6's CLI). Read-path cost and the `snapshot_frequency` dial → Task 4. Meta-test → Task 3.
Interrupt/resume equivalence, non-associative reducer, node retry → Task 5. Real pinned LangGraph,
freshness, naming → Global Constraints and Task 8. SQLite conditional → resolved to _excluded_ by
verification, recorded in Global Constraints. Beta disclosure → Task 8, Step 1.

**One spec item is deliberately not implemented.** The spec lists "node retry re-runs the whole node"
among the pinned behaviours; Task 5 covers interrupt/resume and the non-associative reducer but not
retry. Retry semantics sit closest to `durable-agent-task-engine`'s territory, and the spec itself
warns that this lab should be cut back if it grows retry semantics. Add it only if it can be
demonstrated without importing that lab's subject; otherwise drop it from the spec on the next
revision rather than leaving an unimplemented line.

**Placeholders.** None. Every code step carries runnable code; every "if this fails" note names a
specific action rather than "handle appropriately".

**Type consistency.** `StepCost` (Task 1) is consumed by `WriteResult.per_step` (Task 3) and
`format_write_table` (Task 6) under the same name and field order. `MeasuringSaver.costs` and
`.total_bytes` are used in Task 3 exactly as defined in Task 1. `build_delta`'s
`snapshot_frequency` keyword is threaded identically through Tasks 2, 4, and 6. `ResumeResult` gains
`item_count`, which Task 4's second test asserts — defined in the dataclass in the same task.
