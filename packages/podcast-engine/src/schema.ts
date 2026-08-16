/**
 * What the model answers against, and what the stage produces.
 *
 * These are deliberately different shapes. The draft contains no number except
 * a relative weight and no field code could compute; the artifact contains
 * every computed number. Asked for durations, a model returns values that sum
 * to whatever target it was told, which would make `plannedSeconds` always
 * equal `requestedSeconds` and the shortfall permanently undetectable.
 */

import { z } from "zod";
import type { SynthesisCost } from "@handbook/podcast-providers";

/**
 * `.trim().min(1)` rather than `.min(1)`: the latter accepts a value that is
 * only whitespace, which reaches the artifact as a blank title.
 */
const semanticString = z.string().trim().min(1);

export const DraftBeatSchema = z.object({
  title: semanticString,
  /** What this beat is for — the reason it earns its place in the arc. */
  intent: semanticString,
  /** Ids from the pack. At least one: an uncited beat is the failure mode. */
  excerptIds: z.array(semanticString).min(1),
  /** Relative only. How long this beat should be next to its neighbours. */
  weight: z.number().positive(),
});

export const DraftPlanSchema = z.object({
  title: semanticString,
  /** The argument the episode makes. One sentence, not a topic list. */
  throughLine: semanticString,
  beats: z.array(DraftBeatSchema).min(1),
  /** Arc the model wanted but no excerpt supports. Its own account of the gap. */
  unsupported: z.array(semanticString),
});

export type DraftBeat = z.infer<typeof DraftBeatSchema>;
export type DraftPlan = z.infer<typeof DraftPlanSchema>;

export interface PlannedBeat {
  title: string;
  intent: string;
  excerptIds: string[];
  weight: number;
  /** Computed: min(desired, supportable). Zero is a legitimate outcome. */
  targetSeconds: number;
  /** Computed: this beat's share of the characters it cited. */
  allocatedCharacters: number;
}

export interface Shortfall {
  /** Clamped at zero: floating-point residue must not surface as a negative gap. */
  seconds: number;
  /** Titles of the beats their ceiling bound. Never empty when shortfall is non-null. */
  thinBeats: string[];
}

export interface SegmentBudget {
  maxSegments: number;
  /** The ceiling that was asked for: PlanBudget.maxRenderSeconds, carried through. */
  ceilingSeconds: number;
  /** Projected render at maxSegments. Always <= ceilingSeconds. */
  projectedSeconds: number;
  basis: SynthesisCost;
}

export interface EpisodePlan {
  topic: string;
  title: string;
  throughLine: string;
  beats: PlannedBeat[];
  requestedSeconds: number;
  plannedSeconds: number;
  /** The model's own account of what it could not source. Always present. */
  unsupported: string[];
  /** Null iff no beat was bound by its ceiling. */
  shortfall: Shortfall | null;
  segmentBudget: SegmentBudget;
  /** Carried from the pack, for the freshness check. */
  sourceHash: string;
  /** Carried from the pack: an episode should be able to say what it never saw. */
  droppedForBudget: string[];
}
