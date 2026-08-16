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

export function renderPrompt(pack: SourcePack, excerptIds: readonly string[]): string {
  const lines = [
    `Topic: ${pack.topic}`,
    `Primary source: ${pack.primary.title} (${pack.primary.url})`,
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
      prompt: renderPrompt(pack, excerptIds),
      maxOutputTokens: options.maxOutputTokens,
    },
    excerptIds,
  };
}

export async function planEpisode(
  pack: SourcePack,
  budget: PlanBudget,
  llm: LlmPort,
  options: PlanRequestOptions,
): Promise<PlanResult> {
  // Both refusals precede the model call. The pack is the only input, and a
  // plan built from nothing is built from the model's memory of the topic --
  // which is what the closed-set rule exists to prevent.
  assertPlanBudget(budget);
  if (pack.excerpts.every((excerpt) => excerpt.body.length === 0)) {
    throw new Error(`source pack for "${pack.topic}" has no excerpts with any text`);
  }

  const { request, excerptIds } = buildPlanRequest(pack, options);
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
