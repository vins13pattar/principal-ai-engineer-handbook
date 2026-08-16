# Episode planner design

Date: 2026-08-16
Status: approved, not implemented
Stage: `plan`, the second stage of the podcast pipeline

## Context

[ADR-0008](../../../apps/handbook/src/content/docs/adr/decisions/0008-typescript-podcast-pipeline.mdx)
sets the pipeline as source pack → **plan** → dialogue → review → bounded revision loop → voice
script → audio, orchestrated with ordinary async functions rather than a graph framework.

`packages/handbook-content` already builds the input. A `SourcePack` is a closed set: whatever is in
it, a generation agent may talk about; whatever is not, it may not. It carries per-excerpt
attribution (`documentId`, `heading`), a `sourceHash` for the freshness check, and
`droppedForBudget` — documents cut to fit the context budget, recorded rather than silently omitted.

`packages/podcast-providers` supplies `LlmPort`, whose `generate` validates every response against a
caller-supplied Zod schema at the model boundary, and `FakeLlm`, which does the same validation
without a network.

Commit `66face3` added the third input, and it is the one that changes this design. Local TTS on an
M4 measures:

```text
compute = 3.16s per call + 0.073 x seconds of audio
```

`createLocalTts` spawns a process per `synthesise` call, so the fixed term is paid per segment.
A 40-minute episode renders in 3.0 minutes as one call and 9.3 minutes as 120 — same audio, same
model, because at 120 segments 68% of the render is loading the model. Segment count is therefore a
priced decision, and the planner is the stage with enough context to make it.

## Decisions

### The plan is an outline plus a budget, not a segment list

The plan emits narrative beats without binding segment boundaries, and carries a maximum segment
count and total duration that the voice-script stage must honour. A maximum, not a target: the
artifact holds `maxSegments`, nothing instructs the later stage to reach it, and fewer segments is
always cheaper to render.

Rejected: **plan owns segments**, where each planned segment is directly a `synthesise` call. It
would require the planner to reason about pacing before any dialogue text exists, and a segment
that generates long or short then distorts every projection downstream.

Rejected: **outline only**, with segmentation decided at the voice-script stage. Nothing upstream
would constrain render cost, and the decision would land at the stage with the least context about
episode structure.

The consequence of splitting it is that two places now reason about segmentation, and the budget can
be violated silently. `assertWithinBudget` exists to close that — see below.

### A pack that cannot support the requested length yields a short plan, not a padded one

The planner emits only the beats the excerpts support and records `requestedSeconds` against
`plannedSeconds`, with the gap attributed.

This follows the precedent `droppedForBudget` already set in `SourcePack`: record rather than
silently omit. A 30-minute episode when 40 was asked for is a fine artifact. One padded to 40 with
invented material is not, and it is the kind that looks shippable.

Rejected: **refuse at the boundary** the way `assertSpeakable` refuses an unspeakable language.
Duration is softer than language support, and a hard floor turns a usable short episode into no
episode.

Rejected: **let the reviewer catch it**. That pays for dialogue generation on beats that were never
supportable, and surfaces the padding inside the revision loop — the one unbounded term in the cost
model.

### One package for the engine

`packages/podcast-engine`, with the planner as its first module and dialogue, review, voice, and
assembly joining it as siblings:

```text
packages/podcast-engine/src/
  schema.ts     EpisodePlan, the draft schema, excerpt id derivation
  plan.ts       planEpisode()
  ...           dialogue.ts, review.ts, voice.ts, assemble.ts, pipeline.ts to follow
```

It depends on `@handbook/podcast-providers`, `@handbook/content`, and `zod`. It must not
import `ai` or any `@ai-sdk/*` package — that is the layering `podcast-providers` is explicit about,
and the planner is the first opportunity to break it.

Rejected: **a package per stage**. Five more `package.json`/`tsconfig`/`vitest` setups for stages
that run in one fixed order and share one artifact schema.

Rejected: **extending `podcast-providers`**. It is the provider half, deliberately ignorant of
episodes; a planner there would make it depend on `@handbook/content` and invert the dependency
ADR-0008 established.

### The model does judgment, TypeScript does arithmetic

One `generate` call returns ordered beats with titles, intents, citations, and relative weights.
Everything numeric is computed afterwards in plain TypeScript.

Rejected: **one call does everything**, returning durations as well. Models under-cite when they are
also apportioning a time budget, and the citations are the half that matters — they are what the
groundedness gate reads.

Rejected: **draft then coverage critique**, a second call asking what the arc missed. The source
pack is paid per agent that sees it (`agentsSeeingFullPack` in `cost.ts`), so a second call doubles
the most expensive input in the stage to buy a judgment the review stage already makes with more
information.

## Architecture

```text
SourcePack ──> renderPrompt ──> llm.generate(DraftPlan schema) ──> draft
                                         │ the model's work ends here
                                         ▼
                         validateCitations(draft, pack)                       throws on invented ids
                         apportion(draft, pack, budget)                       weights -> seconds
                         deriveSegmentBudget(cost, plannedSeconds, ceiling)   -> maxSegments
                                         ▼
                                    EpisodePlan
```

`planEpisode(pack, budget, llm)` takes the `LlmPort` as an argument rather than constructing one, so
tests use `FakeLlm` with no network and no key.

### Excerpt ids

`SourceExcerpt` has no id. `(documentId, heading)` is **not** a key either — a document may repeat a
heading, and two distinct headings may normalise to the same slug. The identity that actually exists
is **position: the excerpt's ordered occurrence in `pack.excerpts`**. The derived id has to be a
readable label for that position, not a claim of natural uniqueness.

`slug` is NFKC normalise, lowercase, replace runs of non-`(\p{L}|\p{N}|\p{M})` with `-`, trim leading and
trailing `-`. When the slug is empty, the base uses `section-${n}` with `n` the excerpt's 0-based
ordinal in its document. Uniqueness is then established **against the set of final ids already
issued**, walking `pack.excerpts` in order:

```ts
const base = `${documentId}#${slugOrFallback}`;
let candidate = base;
let suffix = 2;

while (usedIds.has(candidate)) {
  candidate = `${base}-${suffix}`;
  suffix += 1;
}

usedIds.add(candidate);
```

**Counting uses per base is not sufficient, and the failure is ordinary.** Headings `Foo`, `Foo`,
`Foo 2` in pack order: the second `Foo` is issued `foo-2`, and `Foo 2` then slugs naturally to
`foo-2` and collides with it. Reversing to `Foo`, `Foo 2`, `Foo` collides identically. A generated
suffix and a natural slug live in the same namespace, so uniqueness has to be checked in that
namespace rather than per base. Probing against issued ids yields `foo`, `foo-2`, `foo-2-2` for the
first ordering and `foo`, `foo-2`, `foo-3` for the second — unlovely in the first case, and unique
in both, which is the property that matters.

Five things that follow, each of which a naive implementation gets wrong:

- **Uniqueness is global across the pack, not per base.** See above.
- **Collisions are resolved on the normalised slug, not on the raw heading.** "Why not?" and
  "Why not" produce the same slug and must be disambiguated even though the headings differ.
- **Unicode headings survive.** `\p{L}`, `\p{N}` and `\p{M}` are Unicode-aware, so Devanagari and
  Tamil headings slug to themselves lowercased rather than to nothing. Stripping to ASCII would
  empty every non-Latin heading and route them all through the empty-slug fallback, silently
  collapsing distinct sections onto one label. **`\p{M}` is load-bearing, not decoration:** these
  scripts compose base letters with dependent vowel signs and viramas that are their own Unicode
  category, so omitting it does not empty the heading — it tears every syllable apart. `नमस्ते`
  becomes `नमस-त`. Caught during implementation, when the first version of this rule failed the
  Devanagari test written alongside it.
- **Punctuation-only headings are the empty-slug case** and get the positional fallback rather than
  a bare `documentId#`.
- **Ids are pack-relative.** Because identity is occurrence-based, an id means nothing against a
  different pack, and comparing ids across packs is a category error. They are derived once per pack
  and reused for both the prompt and validation.

One exported function, used both to render the prompt and to validate what comes back, so there is
no second definition to drift. Kept engine-local rather than added to `@handbook/content`: the review
stage will want the same ids and also lives here. A third consumer outside the engine is the point
at which to push it upstream.

## Schema

What the model answers against is deliberately smaller than the artifact. It contains no number
except a relative weight, and no field code could compute.

```ts
const DraftBeat = z.object({
  title: z.string().trim().min(1),
  /** What this beat is for — the reason it earns its place in the arc. */
  intent: z.string().trim().min(1),
  /** Ids from the pack. min(1): an uncited beat is the failure mode. */
  excerptIds: z.array(z.string().trim().min(1)).min(1),
  /** Relative only. How long this beat should be next to its neighbours. */
  weight: z.number().positive(),
});

const DraftPlan = z.object({
  title: z.string().trim().min(1),
  /** The argument the episode makes. One sentence, not a topic list. */
  throughLine: z.string().trim().min(1),
  beats: z.array(DraftBeat).min(1),
  /** Arc the model wanted but no excerpt supports. Its own account of the gap. */
  unsupported: z.array(z.string().trim().min(1)),
});
```

`weight` rather than seconds is load-bearing. Asked for durations, a model returns numbers summing
to whatever target it was given, which would make `plannedSeconds` always equal `requestedSeconds`
and the shortfall permanently undetectable. Relative weights it can judge; absolute scale comes from
the source material.

The artifact:

```ts
interface EpisodePlan {
  topic: string;
  title: string;
  throughLine: string;
  beats: PlannedBeat[]; // DraftBeat + targetSeconds + allocatedCharacters
  requestedSeconds: number;
  plannedSeconds: number; // computed: sum of targetSeconds
  /** The model's own account of what it could not source. Always present. */
  unsupported: string[];
  /** Computed. Null iff no beat was bound by its ceiling — see below. */
  shortfall: { seconds: number; thinBeats: string[] } | null;
  segmentBudget: {
    maxSegments: number;
    /** The ceiling that was asked for: budget.maxRenderSeconds, carried through. */
    ceilingSeconds: number;
    /** Projected render at maxSegments. Always ≤ ceilingSeconds. */
    projectedSeconds: number;
    basis: SynthesisCost;
  };
  sourceHash: string; // carried from the pack, for the freshness check
  droppedForBudget: string[]; // carried from the pack
}
```

`unsupported` is a **top-level channel, not a field inside `shortfall`**. Nesting it would make the
model's account vanish exactly when the computed shortfall is null — which is the case where the two
disagreeing is most worth seeing.

`sourceHash` and `droppedForBudget` ride along from the pack rather than being re-derived. The
manifest's freshness check reads the first; the second is already recorded upstream and would be
silently lost if the plan did not carry it forward.

## Apportionment

Relative weight says the shape the model wants. Cited material sets the ceiling.

```text
desired(beat)     = requestedSeconds × weight / Σweights
supportable(beat) = expansionFactor × allocatedCharacters(beat) / charsPerSecond
target(beat)      = min(desired, supportable)
plannedSeconds    = Σ target
```

### Sharing

Each excerpt's characters are divided among the beats citing it, **weight-proportionally**. Two
beats drawing on the same passage share material rather than creating more of it. Without the split,
citing everything everywhere would inflate `plannedSeconds` past what the pack holds.

Allocation is in **integer characters using largest-remainder distribution**, with ties broken by
draft beat order — the order the model returned them in, which is stable for a given draft and needs
no secondary key. This makes conservation exact and testable with `toBe` rather than
`toBeCloseTo`, and makes two runs over the same draft produce identical plans.

**A very small excerpt split across enough beats allocates zero characters to some of them.** This
propagates: a beat whose only citation allocates zero has `supportable = 0` and therefore
`target = 0`.

**Such a beat is retained, not dropped and not floored.** That is the decision, and each rejected
alternative is rejected for a reason already load-bearing elsewhere in this design:

- _Dropping_ it would remove the model's proposed beat from the artifact with no record, which is
  the silent omission `droppedForBudget` exists to prevent one stage earlier.
- _Flooring_ it to some minimum duration would invent time the evidence does not support, which is
  the padding this whole stage refuses.

Its downstream contract, so retention does not become someone else's surprise:

- It appears in `beats` with `targetSeconds: 0` and `allocatedCharacters: 0`.
- It is always in `thinBeats`, since `supportable = 0 < desired`, so it forces `shortfall` non-null.
- The dialogue stage generates nothing for a zero-second beat.
- The voice-script stage cannot assign it a segment, so it consumes none of `maxSegments`.
- If **every** beat is zero-second, `plannedSeconds` is 0 and the plan cannot become an episode.
  That throws rather than returning an artifact whose only honest reading is "nothing is sourceable".

### Shortfall

A beat is **thin** when its ceiling bound it: `supportable(beat) < desired(beat)`.

`shortfall` is null **iff no beat is thin**. It is deliberately not defined as
`plannedSeconds === requestedSeconds`, which would be a floating-point equality test — the hazard
integer largest-remainder allocation was chosen to avoid two sections above. Whether a beat was
clipped is a boolean fact about the `min()`, and the presence of a gap should be decided by that
fact rather than by whether two floats happen to land on each other.

`shortfall.seconds` is then `requestedSeconds - plannedSeconds`, reporting only, and `thinBeats`
names the clipped beats so the starved part of the arc is identifiable rather than merely the fact
that something was.

**A beat is thin only on a material clip**, not on any clip:

```ts
if (desired - supportable > desired * 1e-9) thinBeats.push(beat.title);
```

`desired` and `supportable` are computed by two unrelated float paths — `requestedSeconds × weight /
Σweights` against `expansionFactor × allocated / charsPerSecond` — so when they are mathematically
equal the raw `<` resolves on residue. This design originally accepted that, on the reasoning that a
spurious ~0-second shortfall errs toward disclosure. **Implementation review reversed it**, with
evidence the earlier reasoning did not have: at `requestedSeconds` exactly equal to capacity, 5,070
of 20,000 randomised configurations flagged a beat as thin on a gap of ~1.4e-14. Concretely, 2,226
characters over weights 1/3/2 gives `desired 89.04` against `supportable 89.03999999999999`.

The correction is that this is not a decimal being slightly wrong — it flips a categorical output.
`shortfall` goes non-null, and `thinBeats` names a beat nothing clipped, which is prose a reader
would act on. Erring toward disclosure is only safe when the disclosure is true.

`targetSeconds` stays `min(desired, supportable)` regardless; the epsilon governs only the thin
verdict.

## Segment budget

`projectRenderSeconds` inverts directly:

```text
n × fixed + marginal × plannedSeconds ≤ maxRenderSeconds
maxSegments = floor((maxRenderSeconds − marginal × plannedSeconds) / fixed)
```

At the measured `fixed 3.16s`, `marginal 0.073`, a 2,400-second episode under a five-minute render
ceiling allows **39 segments** — a projected render of 298.4s against the 300s ceiling, where 40
segments would need 301.6s. The same ceiling on a thin 1,780-second plan allows **53** — less audio
to synthesise leaves more room for per-call overhead. The budget is about render time, not episode
length.

Both numbers are recorded. `ceilingSeconds` is what was asked for and `projectedSeconds` is what
`maxSegments` actually costs; they differ by whatever the floor discarded, and
`projectedSeconds ≤ ceilingSeconds` is an invariant rather than a coincidence. Collapsing them into
one `renderSeconds` field would leave every reader guessing which of the two they had.

`maxSegments < 1` means the ceiling is unreachable even as a single call. That throws, with both
numbers, rather than quietly returning zero.

### Configuration, no defaults

```ts
interface PlanBudget {
  requestedSeconds: number;
  expansionFactor: number; // seconds of dialogue per second of read source
  charsPerSecond: number; // measured for your voice — Kokoro af_heart is 16.2
  maxRenderSeconds: number;
  synthesisCost: SynthesisCost; // straight from bench.ts
}
```

Five required fields is a heavy signature, and preferable to a default — but for four different
reasons, which is worth stating rather than collapsing into one:

| Field              | Where it comes from           | Why no default                                                                                      |
| ------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `requestedSeconds` | The request                   | There is no such thing as a default episode length; it is the caller's whole intent                 |
| `expansionFactor`  | Editorial policy              | How much dialogue a passage should sustain is a judgment about the show, not a property of anything |
| `charsPerSecond`   | Measured, per voice           | Voice-specific. Defaulting it to 14 is precisely the bug `66face3` removed from `bench.ts`          |
| `maxRenderSeconds` | Operational constraint        | How long a render may take depends on the machine and on how the operator is working that day       |
| `synthesisCost`    | Measured, per machine + model | Straight from `bench.ts`. A constant here would be someone else's laptop                            |

Only the last two are measured, and only `charsPerSecond` and `synthesisCost` are properties of
hardware or voice. The other three are decisions. A default on any of them would be this file
answering a question it does not have standing to answer.

### Numeric boundaries

Every field is validated before the model call, because each one is divided by or multiplied into a
projection, and a `NaN` reaching the artifact produces a plan whose numbers are all `NaN` with no
indication of which input was wrong.

| Field                        | Requirement    | Why not merely non-negative                           |
| ---------------------------- | -------------- | ----------------------------------------------------- |
| `requestedSeconds`           | finite, `> 0`  | zero requests an episode of no length                 |
| `expansionFactor`            | finite, `> 0`  | zero makes every beat thin and every plan empty       |
| `charsPerSecond`             | finite, `> 0`  | divisor in `supportable`                              |
| `maxRenderSeconds`           | finite, `> 0`  | zero makes `maxSegments < 1` and throws less legibly  |
| `synthesisCost.fixedSeconds` | finite, `> 0`  | **divisor in `maxSegments`** — zero divides by zero   |
| `synthesisCost.marginalRtf`  | finite, `>= 0` | zero is meaningful: synthesis with no per-second cost |

`marginalRtf` is the one field where zero is legitimate rather than a mistake, which is why it is
the only `>= 0` in the table.

The reported gap is clamped, so floating-point residue cannot surface as a negative shortfall:

```ts
shortfallSeconds = Math.max(0, requestedSeconds - plannedSeconds);
```

This composes with the structural null rule rather than competing with it: whether `shortfall` is
null is decided by `thinBeats` being empty, and `shortfallSeconds` only reports the size of a gap
already established to exist. A thin beat clipped by a whisker therefore reports a non-null
shortfall of `0` seconds, which is accurate on both counts.

### Enforcement

`assertWithinBudget(plan, segmentCount)` is exported here and called by the voice-script stage when
it exists. The check lives with the number it checks, so there is one definition of it.

## Error handling

- **Empty pack, or one whose excerpts are all empty:** throws _before_ the model call. The pack is
  the only input; a plan built from nothing is built from the model's memory of the topic, which is
  what the closed-set rule exists to prevent.
- **Invented citations:** Zod validates shape, but shape cannot distinguish a real excerpt id from a
  plausible one. The post-check throws naming the ids that do not exist and how many valid ones the
  pack held — following `gatewayBaseUrl`, which rejects an unknown provider up front rather than
  404ing at call time. Not the full list: a pack can hold hundreds, and a wall of ids is not
  actionable.
- **Duplicate ids within one beat:** deduped, not rejected. It does not change what the beat is
  grounded in.
- **`maxSegments < 1`:** throws with the requested ceiling and the minimum achievable render time.

`planEpisode` returns `{ plan, usage, modelId }` and never touches a `UsageLedger`. The pipeline
records the stage. A stage that writes to a ledger it was handed cannot be called twice in a test
without inventing one.

## Testing

No network anywhere, so the suite runs inside `pnpm verify` like everything else. `FakeLlm` already
validates queued responses against the caller's schema, so a fake cannot return data the real schema
would reject.

### Apportionment invariants

1. **Duplicate citations within a beat do not increase duration.**
2. **Conservation:** for every excerpt cited at least once, its allocated shares across beats sum to
   exactly its character count. Uncited excerpts allocate zero.
3. **No multiplication:** total allocated characters never exceed the union of cited excerpts. While
   conservation holds this is an equality and cannot fail on its own; it is kept as the guard that
   catches a future change breaking (2).
   Follows from (2), pinned separately because it is the anti-inflation claim that is actually true.
4. **`plannedSeconds ≤ min(requestedSeconds, capacity)`**, where
   `capacity = expansionFactor × unionChars / charsPerSecond`. Both bounds, since either can bind.
   Holds **exactly**, not up to residue: summing float `targetSeconds` can overshoot
   `requestedSeconds` by a few ULPs even when no beat was clipped — weights 8/7/2 against 100
   requested sums to 100.00000000000001 — so `plannedSeconds` is clamped to `requestedSeconds`.
   Without the clamp this invariant is literally false and any downstream assertion of it is
   intermittently flaky.
5. **An empty pack produces zero `FakeLlm` calls** — proving the refusal happens before the model
   call rather than after it, which is the entire point of putting it there.
6. **Model-reported gaps stay visible when computed shortfall is null** — `unsupported` and
   `shortfall` are independent channels, and this is the case where a naive implementation drops one
   because the other looks clean.

A stronger invariant was considered and rejected as false: _"a draft where every beat cites every
excerpt produces the same `plannedSeconds` as one where each cites its own."_ Sharing conserves
capacity but does not make `Σ min(desired, supportable)` invariant under redistribution.
Counterexample, with weights 9 and 1, `requestedSeconds` 100, excerpt X supporting 95s and Y
supporting 5s:

| Citation pattern     | A                | B                  | `plannedSeconds` |
| -------------------- | ---------------- | ------------------ | ---------------- |
| A cites X, B cites Y | min(90, 95) = 90 | min(10, 5) = **5** | 95               |
| Both cite both       | min(90, 90) = 90 | min(10, 10) = 10   | 100              |

Redistribution removed B's ceiling. Invariants 2 and 3 constrain the mechanism directly instead of
asserting a downstream consequence that only holds under symmetry.

### Other tests

- `planEpisode` end to end with `FakeLlm`: happy path; invented id rejected; thin pack producing a
  non-null shortfall with starved beats named; rich pack producing `null`.
- Segment budget solved at the boundary, checked at `n` and `n + 1` — at the worked numbers, 39
  projects to 298.4s and 40 to 301.6s against a 300s ceiling.
- `projectedSeconds ≤ ceilingSeconds` holds for every budget the solver returns.
- `shortfall` is null exactly when `thinBeats` is empty, including the case where every beat's
  `supportable` comfortably exceeds its `desired` and `plannedSeconds` lands on `requestedSeconds`
  only to within floating-point error.
- `assertWithinBudget` accepts at the budget and rejects one past it.

### Excerpt id derivation

- A document repeating one heading yields distinct ids, suffixed in pack order.
- Two **different** headings normalising to the same slug — "Why not?" and "Why not" — also yield
  distinct ids. Collision resolution keys on the slug, not the raw heading.
- **A generated suffix colliding with a natural slug.** `Foo`, `Foo`, `Foo 2` and the reordering
  `Foo`, `Foo 2`, `Foo` are both regressions against per-base counting, which issues a duplicate
  for each. Pinned in both orders, because only one of them fails if the probe is written to look
  ahead rather than at what has been issued.
- **An empty-slug fallback against a natural `Section 0` heading**, in both orders. Per-base
  counting happens to survive this one — the fallback and the natural heading share a base — but
  it is the case where a future change to the fallback format would break uniqueness silently.
- **Global uniqueness across every id the pack derives**, asserted as a set-size check over the
  whole corpus pack rather than only over the crafted cases.
- Devanagari and Tamil headings slug to themselves lowercased, not to empty.
- A punctuation-only heading takes the `section-${n}` fallback rather than producing
  `documentId#`.
- Ids are stable across two derivations from the same pack, and the same excerpt in a differently
  ordered pack may legitimately differ — pinned so nobody later "fixes" it into a global key.

### Zero-second beats

- A beat allocated zero characters is present in `beats` with `targetSeconds: 0`, appears in
  `thinBeats`, and forces `shortfall` non-null.
- It consumes none of `maxSegments`.
- A draft in which every beat allocates zero throws rather than returning a zero-length plan.

### Budget validation

- Each of the six numeric requirements rejects its violation before the model call — asserted by
  `FakeLlm` recording **zero** calls, the same way the empty-pack test proves refusal precedes
  spending.
- `fixedSeconds: 0` in particular, since it is the divisor in `maxSegments` and would otherwise
  produce `Infinity` rather than an error.
- `marginalRtf: 0` is accepted, being the one legitimate zero.
- `shortfallSeconds` is never negative.

### Against the live corpus, not fixtures

Build a real `SourcePack` from the content tree — `@handbook/content` already does this in its own
tests — and derive ids from real headings. Duplicate headings, punctuation, and non-ASCII exist in
real pages and not in fixtures. That approach found two loader bugs per ADR-0008, and id derivation
is the same class of thing.

## Open note

> `thinBeats` identifies beats constrained by the model's submitted citation assignment. It does not
> independently prove semantic support. Broad over-citation conserves total capacity but can
> redistribute it and hide localized scarcity; citation relevance remains the reviewer's
> responsibility.

The arithmetic guarantees a conservation property and nothing about meaning. Whether a cited excerpt
actually supports the beat is a judgment, and the review stage is the one built to make it.

The mechanism, stated as a tendency rather than a guarantee. **In the continuous ideal** — real-
valued shares, no rounding — weight-proportional sharing makes `supportable_i` and `desired_i` both
`w_i/Σw` of their respective totals when every beat cites every excerpt, so `plannedSeconds` would
collapse to exactly `min(requestedSeconds, capacity)` with no beat thin.

**Integer largest-remainder allocation does not deliver that exactly**, and the failure is not
exotic. Weights 9 and 1 over a single shared character: the shares are 0.9 and 0.1, both floor to
zero, and the one available character goes to the larger remainder. Beat A gets 1, beat B gets 0, so
B is thin despite citing everything. Rounding leaves residue at every scale, and small excerpts are
where it bites.

So the honest statement is directional: over-citation cannot manufacture evidence, and it _tends_
toward the maximum invariant 4 permits while _tending_ to flatten the `thinBeats` signal. It does
not guarantee either. The reviewer's job is unchanged by which of the two it happens to do on a
given pack.

## Out of scope

- **Dialogue, review, voice script, assembly.** Later stages in the same package.
- **Where segment cuts actually fall.** The voice-script stage places them against real text; this
  stage only sets the budget and the assertion.
- **A persistent local TTS runner.** It would remove the 3.16s per-call cost and change
  `maxSegments` substantially. Recorded in the providers README as measured but not addressed;
  nothing needs it yet, and the number should decide when.
