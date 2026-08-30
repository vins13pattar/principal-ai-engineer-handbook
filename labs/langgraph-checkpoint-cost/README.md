# langgraph-checkpoint-cost

What does it cost to checkpoint a LangGraph state that grows every step?

This lab measures that cost directly, on the actual serialization path
LangGraph uses when it writes a checkpoint -- not a synthetic stand-in for it.
No model is ever called: every node just appends a fixed-size string, so the
state size at any step is a deterministic function of step count and payload
size, and the byte counts the CLI prints are reproducible run to run.

## What it measures

The cost of checkpointing an accumulating state is a **two-sided trade**, and
this lab measures both sides:

- **Write cost** (`sweep.py`, `measuring_saver.py`): how many bytes get
  serialized per step, and how that grows with step count, for three graph
  shapes:
  - `build_accumulating` -- state grows every step (the shape most LangGraph
    apps default into: append to a list in state).
  - `build_non_accumulating` -- the control. State is replaced each step and
    stays a single item, so its per-step write cost is constant.
  - `build_delta` -- the same accumulating growth, but through
    `langgraph.channels.DeltaChannel`, which stores only a sentinel in the
    checkpoint blob instead of the full accumulated list.
- **Resume cost** (`resume.py`): what it costs to get that state back. A
  channel that makes writes cheap by deferring work must do that work
  somewhere, and for `DeltaChannel` it's on read: reconstructing state means
  replaying ancestor writes through the reducer. This lab measures that too,
  swept over `snapshot_frequency` (how often `DeltaChannel` writes a full
  snapshot instead of a sentinel).

A lab that reported only the write path would call `DeltaChannel` free. It
isn't -- it's deferred, and the resume table is where that deferred cost
shows up.

**The write cost itself has two parts, and the CLI reports both, unsummed.**
`DeltaChannel.checkpoint()` always returns `MISSING` -- its committed state
never appears in a checkpoint's `channel_values`, so `put()` alone sees only
the sentinel, the checkpoint remainder, and metadata. The channel's actual
state (for a non-snapshot step) lives entirely in the pending-writes table
instead, written through `put_writes()` -- the same table
`InMemorySaver.get_delta_channel_history` reads back out on reconstruction.
`measuring_saver.py` measures both calls and reports them as separate
columns (`put bytes` / `writes bytes`) rather than a single total: for every
other channel in this lab, `put_writes` bytes largely duplicate what `put()`
already counted, so summing them would double-count; for `DeltaChannel` the
two are non-overlapping and only their sum is the real cost. See
`measuring_saver.py`'s module docstring for the full accounting, and
`cli.py`'s `items` column, which checks each sweep point actually reached
the expected item count before trusting its byte counts.

**On the resume numbers specifically:** the timed column is labelled
`get_state ms`, not "reconstruct" or "replay" time, because that's what it
actually measures. `ResumeResult.reconstruct_seconds` times the *entire*
`get_state` call -- checkpoint fetch, full checkpoint deserialization,
`channels_from_checkpoint` (the `DeltaChannel` ancestor-replay this lab cares
about), `prepare_next_tasks`, and `dict(get_subgraphs())` -- not an isolated
replay step. See the module docstring in `src/checkpoint_cost/resume.py` for
the full accounting of what's inside that timed region and why a large
difference in replay depth doesn't translate into a proportionally large
difference in wall time.

## `DeltaChannel` is beta

`DeltaChannel` is a beta LangGraph API with an **explicitly unstable on-disk
contract**. Checkpoints it writes are not guaranteed to remain readable
across LangGraph versions the way checkpoints from stable channels are. Don't
read the write-cost numbers the CLI prints as "use `DeltaChannel` in
production without checking this first" -- they're a measurement of a trade,
not an endorsement.

`langgraph==1.2.11`'s `DeltaChannel` write path can also deadlock at the step
counts this lab sweeps (an order-inversion in its internal thread-pool
scheduling -- see the docstring in `resume.py` for the full mechanism). This
is not a theoretical risk: an unpatched 100-step delta sweep was run and
hung, and was killed after 5 minutes. `cli.py` works around it by passing
`max_concurrency` on the delta arm's `invoke` config; this is a workaround
for a real bug in the pinned version, not a normal part of using the API, and
byte counts under the patch match unpatched runs at step counts where the
unpatched run does complete -- the workaround does not perturb the
measurement.

## What's excluded, and why

This lab is in-memory only (`langgraph.checkpoint.memory.InMemorySaver`).
Disk/SQLite checkpointing is out of scope because `langgraph.checkpoint.sqlite`
is a **separate PyPI distribution** from `langgraph` -- pulling it in would
mean testing a different package's I/O and serialization path, not
LangGraph's own checkpoint-write cost. What this lab measures is the
serialization cost LangGraph itself controls; disk latency on top of that is
a different, and separately interesting, question.

## A deliberate deviation: `mypy` covers tests too

Unlike this repo's other labs, `mypy --strict` here runs over `tests` as well
as `src` (`mypy src tests`, not just `mypy src`). Test code that silently
loses type information (e.g. from `# type: ignore` sprinkled to make a test
pass, or fixtures whose return types drift from what they claim) can hide a
real bug in the code under test. Since a chunk of this lab's value is "trust
these numbers," the test suite itself is held to the same bar as the
production code.

## Running it

```bash
./.venv/bin/python -m ruff check .
./.venv/bin/python -m mypy src tests
./.venv/bin/python -m pytest -q
./.venv/bin/python -m checkpoint_cost.cli
```

The last command prints all four tables: the three write-path sweeps
(accumulating, the non-accumulating control, and `DeltaChannel`) and the
resume-cost sweep over `snapshot_frequency`.
