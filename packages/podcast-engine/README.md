# @handbook/podcast-engine

The podcast pipeline's stages. `plan` is the only one implemented.

The design is [the episode planner spec](../../docs/superpowers/specs/2026-08-16-episode-planner-design.md);
the orchestration decision is [ADR-0008](https://handbook.vinodspattar.in/adr/decisions/0008-typescript-podcast-pipeline/).

## The split that matters

The model returns judgment, plus one relative number. TypeScript returns every number that means
anything on its own.

```text
llm.generate(DraftPlan)   ordered beats, citations, relative weights
      |
validateCitations         an id not in the pack throws, naming it
apportion                 weights -> seconds, bounded by cited characters
deriveSegmentBudget       render ceiling -> maxSegments
      |
EpisodePlan
```

Ask a model for durations and it returns numbers that sum to whatever target you gave it, which
would make `plannedSeconds` always equal `requestedSeconds` and a shortfall impossible to detect.
Relative weights it can judge; the absolute scale comes from the source.

## Two things it refuses to do

**It will not pad.** A pack that supports 1,780 seconds produces a 1,780-second plan, with the gap
in `shortfall` and the starved beats named in `thinBeats`. An episode short of its target is a fine
artifact; one padded to target with invented material is the kind that looks shippable.

**It will not trust a citation.** Zod validates the shape of what comes back, but shape cannot tell
a real excerpt id from a plausible one. Ids are derived from the pack and checked against it.

## Segment count is priced, not chosen

`createLocalTts` spawns a process per `synthesise` call, so model load is paid per segment. At the
measured 3.16s fixed and 0.073 marginal, a 40-minute episode renders in 3.0 minutes as one call and
9.3 as 120. `maxSegments` falls out of inverting `projectRenderSeconds` against a render ceiling —
39 segments for a 40-minute episode under five minutes of render. `assertWithinBudget` is how the
voice-script stage proves it honoured that.

## Verify it

```bash
pnpm --filter @handbook/podcast-engine test
pnpm --filter @handbook/podcast-engine check
```

No network. `FakeLlm` validates every queued response against the caller's real schema, so a test
cannot prove the pipeline works on data the schema would reject. One suite runs against the live
content tree rather than fixtures, because duplicate headings and non-ASCII exist in real pages.
