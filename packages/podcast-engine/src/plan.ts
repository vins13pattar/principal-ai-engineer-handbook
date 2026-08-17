/**
 * The plan stage: a source pack in, a validated episode plan out.
 *
 * One model call, and it is asked only for judgment -- the arc, the citations,
 * and how long each beat should be relative to its neighbours. That relative
 * weight is the one number the model supplies and the artifact keeps; every
 * absolute or operational number is computed here afterwards. A model asked to
 * apportion a time budget under-cites, and the citations are the half the
 * groundedness gate reads.
 */

import type { SourcePack } from "@handbook/content";
import type { LlmPort, StructuredRequest, Usage } from "@handbook/podcast-providers";
import { apportion } from "./apportion.ts";
import { assertPlanBudget, deriveSegmentBudget } from "./budget.ts";
import type { PlanBudget } from "./budget.ts";
import { deriveExcerptIds } from "./ids.ts";
import { DraftPlanSchema } from "./schema.ts";
import type { DraftPlan, EpisodePlan } from "./schema.ts";

export interface PlanResult {
  plan: EpisodePlan;
  usage: Usage;
  modelId: string;
}

const SYSTEM = [
  "You plan podcast episodes from a closed set of source excerpts.",
  "You may only discuss what the excerpts contain. If the arc you want is not",
  "supported by an excerpt, put it in `unsupported` rather than writing a beat",
  "for it.",
  "Every beat must cite at least one excerpt id, copied exactly from the list.",
  "`weight` is relative only -- how long a beat should be next to its",
  "neighbours. Do not attempt to make weights sum to anything in particular,",
  "and do not estimate durations.",
].join(" ");

/**
 * The shortest a beat can be and still be a segment rather than an aside.
 *
 * Unconstrained, the model plans a beat per excerpt heading: a real 300-second
 * run came back with 11, which is 27 seconds each -- two turns of dialogue
 * before the subject changes. The episode reads as a list of topics rather than
 * an argument, and no downstream stage can put that back together.
 */
export const SECONDS_PER_BEAT = 60;

/**
 * Beats to ask for, from the duration.
 *
 * Floored at 3 because an episode still needs an opening, a middle, and a
 * close however short it is, and capped at 12 because past a dozen segments
 * the arc is a list again regardless of how long each one gets.
 */
export function beatsForSeconds(seconds: number): number {
  return Math.min(12, Math.max(3, Math.round(seconds / SECONDS_PER_BEAT)));
}

export function renderPrompt(
  pack: SourcePack,
  excerptIds: readonly string[],
  requestedSeconds: number,
): string {
  const beats = beatsForSeconds(requestedSeconds);
  const lines = [
    `Topic: ${pack.topic}`,
    `Primary source: ${pack.primary.title} (${pack.primary.url})`,
    `Episode length: about ${Math.round(requestedSeconds)} seconds.`,
    `Plan ${beats} beats. Each one is a segment of the argument with room to`,
    "develop, not a heading to mention -- combine related excerpts into one",
    "beat rather than giving every excerpt its own.",
    "",
    "Excerpts, each with the id you must cite it by:",
    "",
  ];

  excerptIds.forEach((id, position) => {
    const excerpt = pack.excerpts[position];
    if (!excerpt) return;
    lines.push(`[${id}] ${excerpt.title} — ${excerpt.heading}`, excerpt.body, "");
  });

  lines.push("Plan an episode from these excerpts and nothing else.");
  return lines.join("\n");
}

/**
 * Shape validation cannot tell a real excerpt id from a plausible one, so this
 * runs after it. Names the invented ids and how many valid ones existed --
 * following `gatewayBaseUrl`, which rejects an unknown provider up front
 * rather than 404ing at call time. Not the full list: a pack can hold hundreds
 * and a wall of ids is not actionable.
 */
export function validateCitations(draft: DraftPlan, excerptIds: readonly string[]): void {
  const known = new Set(excerptIds);
  const invented = new Set<string>();

  for (const beat of draft.beats) {
    for (const id of beat.excerptIds) {
      if (!known.has(id)) invented.add(id);
    }
  }

  if (invented.size > 0) {
    throw new Error(
      `the plan cites ${invented.size} excerpt id(s) that are not in the pack: ` +
        `${[...invented].join(", ")} (the pack has ${excerptIds.length})`,
    );
  }
}

export interface PlanRequestOptions {
  maxOutputTokens: number;
  /**
   * Drives the beat count, so the prompt can ask for an arc proportional to
   * the episode rather than one beat per heading.
   */
  requestedSeconds: number;
}

/**
 * The one construction of the plan request, shared by the caller that sends it
 * and the estimator that prices it.
 *
 * It derives the excerpt ids rather than accepting them. Accepting them would
 * let a caller pair this prompt with ids from a different array, and
 * `renderPrompt` skips an excerpt with no matching entry rather than failing --
 * so the symptom would be a model unable to cite what it was never shown, and
 * an error blaming the model for it.
 */
export function buildPlanRequest(
  pack: SourcePack,
  options: PlanRequestOptions,
): { request: StructuredRequest<DraftPlan>; excerptIds: string[] } {
  const excerptIds = deriveExcerptIds(pack.excerpts);

  return {
    request: {
      schema: DraftPlanSchema,
      system: SYSTEM,
      prompt: renderPrompt(pack, excerptIds, options.requestedSeconds),
      maxOutputTokens: options.maxOutputTokens,
    },
    excerptIds,
  };
}

export async function planEpisode(
  pack: SourcePack,
  budget: PlanBudget,
  llm: LlmPort,
  options: { maxOutputTokens: number },
): Promise<PlanResult> {
  // Both refusals precede the model call. The pack is the only input, and a
  // plan built from nothing is built from the model's memory of the topic --
  // which is what the closed-set rule exists to prevent.
  assertPlanBudget(budget);
  if (pack.excerpts.every((excerpt) => excerpt.body.length === 0)) {
    throw new Error(`source pack for "${pack.topic}" has no excerpts with any text`);
  }

  // The duration comes from the budget rather than from `options`: two sources
  // for one number is one that can disagree, and a disagreement here would ask
  // the model for a different episode than the one being apportioned.
  const { request, excerptIds } = buildPlanRequest(pack, {
    maxOutputTokens: options.maxOutputTokens,
    requestedSeconds: budget.requestedSeconds,
  });
  const result = await llm.generate<DraftPlan>(request);

  validateCitations(result.value, excerptIds);

  const { beats, plannedSeconds, shortfall } = apportion(
    result.value,
    pack.excerpts,
    excerptIds,
    budget,
  );

  const plan: EpisodePlan = {
    topic: pack.topic,
    title: result.value.title,
    throughLine: result.value.throughLine,
    beats,
    requestedSeconds: budget.requestedSeconds,
    plannedSeconds,
    unsupported: result.value.unsupported,
    shortfall,
    segmentBudget: deriveSegmentBudget(
      budget.synthesisCost,
      plannedSeconds,
      budget.maxRenderSeconds,
    ),
    sourceHash: pack.sourceHash,
    droppedForBudget: pack.droppedForBudget,
  };

  // No UsageLedger here on purpose: the pipeline records the stage. A stage
  // that writes to a ledger it was handed cannot be called twice in a test
  // without inventing one.
  return { plan, usage: result.usage, modelId: result.modelId };
}
