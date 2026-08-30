# LangGraph checkpoint cost design

The twelfth lab. It exists to settle one claim the handbook currently asserts without measuring, and
to give [Module 7](../../../apps/handbook/src/content/docs/learn/modules/07-langgraph.mdx) the
companion lab it has never had.

## The claim this lab exists to settle

The [LangGraph Reference lookup](../../../apps/handbook/src/content/docs/reference/lookups/langgraph.mdx)
states, under Common Gotchas:

> Large accumulated state gets slower every step when the whole value is re-serialized per
> checkpoint. That is the problem `DeltaChannel` exists for; reaching for it late means rewriting
> the state model.

That is an assertion. Nothing in the repository measures it, and it carries a strong operational
recommendation — restructure your state model — on no published evidence. A lab is what turns that
into a number.

The lab measures two things the claim implies and does not quantify:

1. **The shape of the cost curve** for a graph whose state accumulates. Flat, linear, or
   superlinear, and from what state size the difference becomes operationally interesting.
2. **What `DeltaChannel` actually buys**, including the case the lookup does not consider: whether
   delta bookkeeping costs _more_ than full serialization below some state size. If it does, the
   advice is conditional and the lookup should say so.

The second is the one worth building the lab for. "Use `DeltaChannel` for large state" is only
useful advice if someone can say what large means.

## Why this is not `durable-agent-task-engine` again

The two labs would sound adjacent to anyone reading a table of contents, so the boundary is stated
here rather than discovered later.

`durable-agent-task-engine` owns durability **semantics**: leases, fencing, at-least-once delivery,
dead-lettering by delivery attempt, checkpointed resumption as a correctness property. It answers
_what guarantees can you get_.

This lab owns the **price** of persistence: bytes serialized per step, as a function of run length
and state shape. It answers _what does the guarantee cost_.

Neither asserts the other's subject. If this lab starts growing lease or retry semantics, it has
drifted and should be cut back.

## Construction

### Real LangGraph, pinned

The lab depends on the real `langgraph` package, pinned to the version the Reference lookup was
verified against, and carries a `freshness` block.

This follows the precedent set when `multi-tenant-mcp-server` was rebuilt rather than migrated: a
reimplementation of a library's behaviour measures the reimplementation, not the library. A
checkpoint-cost number produced by a hand-rolled serializer would be worth nothing, because the cost
being measured _is_ the library's serialization strategy.

The directory is named `labs/langgraph-checkpoint-cost` deliberately. `scripts/lint-content-structure.ts`
matches its fast-moving topic list against a page's path, and `langgraph` is on that list, so any
page written about this lab is permanently required to carry freshness metadata and to be
re-verified inside the review window. Naming it something neutral would silently opt out of the
enforcement this lab most needs.

**Version policy.** Pin an exact version. Record it in the lab README and in the Build page's
`verifiedAgainst`. Before writing any API detail into prose, inspect the installed build — the
Reference lookup's own revision history records a correction made for exactly this reason, and its
`verifiedAgainst` reads "API surface inspected on an installed build" rather than naming a docs
page. The same standard applies here: no import path, class name, or keyword argument goes into the
spec's implementation or the Build page without being confirmed against the installed package.

### No model is ever called

Nodes are deterministic functions that return a configured quantity of state. This is the same
choice `model-router`, `semantic-cache`, and `evaluation-platform` make, for the same reason: the
measurement has to be reproducible, and a model's output size is not.

It also keeps the measurement honest. A real model call would dominate the wall clock so completely
that serialization cost would be unmeasurable noise — which is, incidentally, a finding worth
stating on the Build page.

### What is measured, and how

A wrapper around the configured checkpointer records, per step:

- **bytes serialized** — the size of what the checkpointer was handed
- **serialize wall-clock** — time spent in serialization alone
- **step index** and the current logical state size

Wrapping the checkpointer rather than timing the whole graph isolates serialization from node
execution and from disk. Disk behaviour is a separate variable and would make the numbers a property
of the test machine's filesystem.

Two checkpointer configurations are measured:

| Configuration          | What it isolates                                               |
| ---------------------- | -------------------------------------------------------------- |
| In-memory checkpointer | Serialization cost with no I/O                                 |
| SQLite checkpointer    | The same run with a real write path, to show the amplification |

The headline table is the in-memory one, because it measures the thing the claim is about. The
SQLite run exists so the Build page can say whether disk changes the shape of the curve or only its
constant.

**The SQLite half is conditional.** LangGraph's SQLite checkpointer ships as its own distribution
rather than in the core package, so including it means a second pinned dependency and a second
re-verification obligation — against a risk this spec has already accepted once, reluctantly.
Confirm the packaging on the installed build before committing to it. If it is a separate
distribution, drop the SQLite configuration from the first implementation and say on the Build page
that the numbers exclude disk. A measurement that covers less but adds no dependency is the better
trade here, and the in-memory table is the one the claim is actually about.

### The graph fixtures

Three graphs, each run for a configurable number of steps:

1. **Accumulating** — state grows every step (a message list under an appending reducer). This is
   the shape the lookup's warning is about.
2. **Non-accumulating** — state is replaced each step and stays a constant size. The control.
3. **Accumulating with `DeltaChannel`** — the same growth as (1), with the channel the lookup
   recommends.

Run lengths are swept, not sampled at one point. A single run length cannot distinguish linear from
superlinear growth, and the difference between those two is the entire finding.

## The meta-test

`test_a_non_accumulating_graph_shows_flat_cost` is the test the rest of the suite depends on.

If cost rises for the non-accumulating graph too, the harness is measuring something other than
state growth — step overhead, a leak in the wrapper, or the checkpointer's own bookkeeping — and
every number the lab publishes is unattributable. "Cost grows with run length" would then be true by
construction and prove nothing.

This is the `evaluation-platform` lesson applied to this lab's own instrument: a measurement that
cannot come out flat is not a measurement. Its twin asserts that the accumulating graph does _not_
show flat cost, so the harness is pinned from both directions.

## What the tests pin beyond the headline

Each of these is a claim Module 7 or the Reference lookup makes that nothing currently proves.

- **Interrupt and resume are one mechanism.** Module 7's central claim is that making control flow
  into data means crash-recovery and human-approval stop being two things. The test drives both
  paths — a run resumed after an interrupt for approval, and a run resumed from a checkpoint after
  the process is torn down — and asserts they resolve through the same resumption path with the same
  resulting state.
- **A missing reducer silently overwrites.** Two branches writing the same channel with no reducer
  configured: one update survives, no error is raised, and nothing in the result distinguishes this
  from correct behaviour. This is the same failure class as `semantic-cache`'s false hits and
  `agent-identity-broker`'s disabled audience check — dangerous because it has no runtime symptom.
- **Node retry re-runs the whole node.** The lookup states the retry unit is the node and that a
  partially-completed node re-runs from the top. The test asserts a node with a side effect executes
  it twice under retry, which is the concrete form of the idempotency requirement
  [Module 2](../../../apps/handbook/src/content/docs/learn/modules/02-distributed-systems.mdx)
  argues for.

## Output

A `measure` entry point prints the swept table, in the shape the Build page will publish:

```text
steps   full-state bytes   delta bytes   full ms   delta ms
   10             ...           ...         ...        ...
   50             ...           ...         ...        ...
  100             ...           ...         ...        ...
```

Numbers are deliberately absent from this spec. Writing expected values into a design document is
how a suite ends up asserting the conclusion it was written around — the failure `model-router`
recorded rather than smoothed over. The table's _shape_ is specified; its contents are whatever the
run produces.

## Testing gates

The three every lab in this repository is measured against, and nothing new:

```bash
./.venv/bin/python -m ruff check .
./.venv/bin/python -m mypy src
./.venv/bin/python -m pytest -q
```

Plus its own CI workflow, matching the pattern of the existing eleven.

Tests must run without network access. The pinned dependency is installed in CI; nothing in the
suite reaches a service.

## Scope of the first implementation

- The Python project under `labs/langgraph-checkpoint-cost`, passing all three gates
- Its CI workflow
- Its Build page, with a `freshness` block naming the pinned version
- A roadmap update recording that its Architecture page and its episode do not exist yet

## Out of scope

- **The Architecture page.** Deliberately deferred until the measurement exists. Writing the design
  review first would mean arguing for a conclusion before seeing the number, which is the failure
  this lab is being built to correct in the first place.
- **The episode.** Follows the Architecture page.
- **Durability semantics** — leases, dead-lettering, delivery counting. `durable-agent-task-engine`
  owns these.
- **Any comparison against another orchestration framework.** A second library would double the
  version-tracking obligation and change the lab's subject from _what does checkpointing cost_ to
  _which framework is better_.
- **Real model calls, and any measurement of end-to-end agent latency.**

## Risks, recorded before the work rather than after

**The finding may not hold.** If the curve is linear and cheap, or `DeltaChannel`'s benefit is
marginal at realistic state sizes, that is the result and the Build page says so — and the Reference
lookup's Common Gotchas entry gets corrected, because it would then be overstating a cost. A lab
that can only confirm the claim it was built around is not evidence.

**This is the repository's first heavyweight dependency.** Every existing lab is standard library
plus something small — `pydantic`, `PyJWT`. `langgraph` pulls a substantial tree into CI, and its
place on the fast-moving list means this lab carries a re-verification obligation on a 90-day cycle
that no other lab has. That cost is accepted deliberately: measuring a library's behaviour requires
depending on the library.

**A pinned version dates faster here than elsewhere.** The lookup records that `0.x` examples "are
everywhere and do not run" because the API changed across `1.0`. The same will eventually be true of
what this lab pins. The freshness block and the linter's review window are the mechanism that
surfaces it; nothing else needs building for it.
