/**
 * Turning relative weights into seconds, bounded by the cited source.
 *
 * Weight says the shape the model wants. Cited material says what it can
 * sustain. `target = min(desired, supportable)`, and the shortfall is what
 * falls out -- not a separate mechanism bolted on.
 *
 * Each excerpt's characters are shared weight-proportionally among the beats
 * citing it. Two beats drawing on one passage are sharing material, not making
 * more of it; without the split, citing everything everywhere would inflate
 * `plannedSeconds` past what the pack holds.
 */

import type { SourceExcerpt } from "@handbook/content";
import type { PlanBudget } from "./budget.ts";
import type { DraftPlan, PlannedBeat, Shortfall } from "./schema.ts";

export interface ApportionResult {
  beats: PlannedBeat[];
  plannedSeconds: number;
  shortfall: Shortfall | null;
}

/**
 * Splits `characters` across `weights` as integers summing to exactly
 * `characters`, by largest remainder.
 *
 * Integer rather than fractional so conservation is exact and testable with
 * `toBe`, and two runs over one draft produce identical plans. Ties in the
 * remainder go to the earlier beat in draft order, which is stable for a given
 * draft and needs no secondary key.
 */
export function allocateCharacters(characters: number, weights: readonly number[]): number[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0 || characters <= 0) return weights.map(() => 0);

  const exact = weights.map((weight) => (characters * weight) / totalWeight);
  const allocated = exact.map((value) => Math.floor(value));
  let remaining = characters - allocated.reduce((sum, value) => sum + value, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    allocated[index] = (allocated[index] ?? 0) + 1;
    remaining -= 1;
  }

  return allocated;
}

export function apportion(
  draft: DraftPlan,
  excerpts: readonly SourceExcerpt[],
  excerptIds: readonly string[],
  budget: PlanBudget,
): ApportionResult {
  // `excerpts` and `excerptIds` are positionally aligned -- `excerpts[position]`
  // is looked up by the id at that same position below. A caller passing
  // mismatched lengths would silently under-allocate (missing excerpts read as
  // zero characters) instead of failing, so the contract is asserted up front.
  if (excerpts.length !== excerptIds.length) {
    throw new Error(
      `excerpts and excerptIds must be the same length: got ${excerpts.length} excerpts and ` +
        `${excerptIds.length} excerptIds`,
    );
  }

  // Deduped per beat: citing one excerpt twice does not change what the beat
  // is grounded in, and must not change what it is allowed to say.
  const citations = draft.beats.map((beat) => new Set(beat.excerptIds));
  const allocatedCharacters = draft.beats.map(() => 0);

  excerptIds.forEach((id, position) => {
    const characters = excerpts[position]?.body.length ?? 0;
    const citing: number[] = [];
    citations.forEach((cited, beatIndex) => {
      if (cited.has(id)) citing.push(beatIndex);
    });
    if (citing.length === 0 || characters === 0) return;

    const shares = allocateCharacters(
      characters,
      citing.map((beatIndex) => draft.beats[beatIndex]!.weight),
    );
    citing.forEach((beatIndex, shareIndex) => {
      allocatedCharacters[beatIndex] =
        (allocatedCharacters[beatIndex] ?? 0) + (shares[shareIndex] ?? 0);
    });
  });

  const totalWeight = draft.beats.reduce((sum, beat) => sum + beat.weight, 0);
  const thinBeats: string[] = [];

  const beats: PlannedBeat[] = draft.beats.map((beat, index) => {
    const allocated = allocatedCharacters[index] ?? 0;
    const desired = (budget.requestedSeconds * beat.weight) / totalWeight;
    const supportable = (budget.expansionFactor * allocated) / budget.charsPerSecond;
    // `desired` and `supportable` are computed by unrelated float paths, so a
    // beat exactly at capacity can land a few ULPs apart. A raw `<` would
    // report that beat as thin on floating-point residue rather than on any
    // real shortfall, flipping `shortfall` to non-null and naming a beat that
    // was never actually clipped. The epsilon is relative to `desired` so it
    // scales with the magnitude of the comparison.
    if (desired - supportable > desired * 1e-9) thinBeats.push(beat.title);

    return {
      title: beat.title,
      intent: beat.intent,
      excerptIds: [...citations[index]!],
      weight: beat.weight,
      targetSeconds: Math.min(desired, supportable),
      allocatedCharacters: allocated,
    };
  });

  // Summing float `targetSeconds` values can overshoot `requestedSeconds` by a
  // few ULPs even when no beat was individually flagged thin (e.g. weights
  // 8/7/2 against 100 requested). Clamping here keeps the documented invariant
  // `plannedSeconds <= requestedSeconds` exact rather than "true up to
  // residue".
  const plannedSeconds = Math.min(
    beats.reduce((sum, beat) => sum + beat.targetSeconds, 0),
    budget.requestedSeconds,
  );

  if (plannedSeconds <= 0) {
    throw new Error(
      "no beat has any supporting text: every beat allocated zero characters, so the plan " +
        "cannot become an episode",
    );
  }

  // Null iff no beat was clipped. Deliberately not `plannedSeconds ===
  // requestedSeconds`, which is a floating-point equality test -- the hazard
  // integer allocation was chosen to avoid. Whether a beat was clipped is a
  // boolean fact about the min().
  // `Math.max(0, ...)` is defensive, not load-bearing: `plannedSeconds` is
  // already clamped to `budget.requestedSeconds` above, so the difference
  // here is non-negative by construction. Nothing currently reaches the
  // clamp.
  const shortfall: Shortfall | null =
    thinBeats.length === 0
      ? null
      : {
          seconds: Math.max(0, budget.requestedSeconds - plannedSeconds),
          thinBeats,
        };

  return { beats, plannedSeconds, shortfall };
}
