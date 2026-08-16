/**
 * The numbers the planner is given, and the segment budget it derives.
 *
 * `createLocalTts` spawns a process per `synthesise` call, so the fixed cost
 * of loading a model is paid per segment rather than per episode. That makes
 * segment count a priced decision: at the measured 3.16s fixed and 0.073
 * marginal, a 40-minute episode is three minutes of render as one call and
 * nine as a hundred and twenty. This module turns a render-time ceiling into
 * the maximum segment count that fits inside it.
 */

import { projectRenderSeconds } from "@handbook/podcast-providers";
import type { SynthesisCost } from "@handbook/podcast-providers";
import type { EpisodePlan, SegmentBudget } from "./schema.ts";

/**
 * No defaults, and for four different reasons.
 *
 * `charsPerSecond` and `synthesisCost` are measured properties of a voice and
 * a machine. `requestedSeconds` comes from the request. `expansionFactor` is
 * editorial policy. `maxRenderSeconds` is an operational constraint. A default
 * on any of them would be this file answering a question it has no standing to
 * answer -- and `charsPerSecond` defaulting to 14 is exactly the bug that made
 * every reported real-time factor 15% optimistic before commit 66face3.
 */
export interface PlanBudget {
  requestedSeconds: number;
  /** Seconds of dialogue one second of read source sustains. */
  expansionFactor: number;
  /** Measured for your voice. Kokoro af_heart is 16.2. */
  charsPerSecond: number;
  maxRenderSeconds: number;
  /** Straight from bench.ts. */
  synthesisCost: SynthesisCost;
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite, got ${value}`);
  if (value <= 0) throw new Error(`${name} must be greater than zero, got ${value}`);
}

/**
 * Validates before any model call, because each field is divided by or
 * multiplied into a projection. A NaN reaching the artifact makes every number
 * in the plan NaN with no indication of which input was wrong.
 */
export function assertPlanBudget(budget: PlanBudget): void {
  assertPositive("requestedSeconds", budget.requestedSeconds);
  assertPositive("expansionFactor", budget.expansionFactor);
  assertPositive("charsPerSecond", budget.charsPerSecond);
  assertPositive("maxRenderSeconds", budget.maxRenderSeconds);
  // The divisor in maxSegments. Zero here yields Infinity rather than an error.
  assertPositive("synthesisCost.fixedSeconds", budget.synthesisCost.fixedSeconds);

  const marginal = budget.synthesisCost.marginalRtf;
  if (!Number.isFinite(marginal)) {
    throw new Error(`synthesisCost.marginalRtf must be finite, got ${marginal}`);
  }
  // The one legitimate zero: synthesis with no per-second cost is coherent.
  if (marginal < 0) {
    throw new Error(`synthesisCost.marginalRtf must not be negative, got ${marginal}`);
  }
}

/**
 * Inverts `projectRenderSeconds`:
 *
 *   n x fixed + marginal x plannedSeconds <= ceilingSeconds
 */
export function deriveSegmentBudget(
  cost: SynthesisCost,
  plannedSeconds: number,
  ceilingSeconds: number,
): SegmentBudget {
  const maxSegments = Math.floor(
    (ceilingSeconds - cost.marginalRtf * plannedSeconds) / cost.fixedSeconds,
  );

  if (maxSegments < 1) {
    const minimum = projectRenderSeconds(cost, plannedSeconds, 1);
    throw new Error(
      `render ceiling of ${ceilingSeconds}s is unreachable: ${plannedSeconds}s of audio ` +
        `needs at least ${minimum.toFixed(1)}s as a single call`,
    );
  }

  return {
    maxSegments,
    ceilingSeconds,
    projectedSeconds: projectRenderSeconds(cost, plannedSeconds, maxSegments),
    basis: cost,
  };
}

/**
 * The budget's enforcement, living with the number it enforces.
 *
 * The plan sets a maximum and the voice-script stage places the actual cuts,
 * so without this the budget is advice. One definition of the check means the
 * two stages cannot disagree about what the maximum meant.
 */
export function assertWithinBudget(plan: EpisodePlan, segmentCount: number): void {
  if (!Number.isInteger(segmentCount) || segmentCount < 1) {
    throw new Error(`an episode needs at least one segment, got ${segmentCount}`);
  }
  if (segmentCount > plan.segmentBudget.maxSegments) {
    throw new Error(
      `${segmentCount} segments exceeds the plan's budget of ${plan.segmentBudget.maxSegments} ` +
        `(ceiling ${plan.segmentBudget.ceilingSeconds}s at ${plan.segmentBudget.basis.fixedSeconds}s per call)`,
    );
  }
}
