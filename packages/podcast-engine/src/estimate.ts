/**
 * What a plan call will cost, scoped to what it actually does.
 *
 * The total is `estimatedAtMaxOutput`, not an upper bound, and the name is the
 * honest part. Only the output side is capped. Input is an estimate that can be
 * exceeded twice over: `estimateTokens` is four characters per token by design,
 * and a structured-output call sends the JSON schema as request framing that no
 * character count of the prompt string can see.
 *
 * Speech is absent rather than zero. `plan` does not synthesise, so pricing
 * synthesis into its total would put dollars on work the command never
 * performs.
 */

import { estimateTokens } from "@handbook/content";
import type { PriceList } from "@handbook/podcast-providers";

export interface CostBreakdown {
  inputTokens: number;
  inputCost: number;
  maxOutputTokens: number;
  maxOutputCost: number;
  /** Deliberately not "upper bound": input is not capped. */
  estimatedAtMaxOutput: number;
}

export function estimatePlanCost(
  request: { system: string; prompt: string },
  prices: PriceList,
  maxOutputTokens: number,
): CostBreakdown {
  const inputTokens = estimateTokens(`${request.system}${request.prompt}`);
  const inputCost = (inputTokens / 1_000_000) * prices.inputPerMillionTokens;
  const maxOutputCost = (maxOutputTokens / 1_000_000) * prices.outputPerMillionTokens;

  return {
    inputTokens,
    inputCost,
    maxOutputTokens,
    maxOutputCost,
    estimatedAtMaxOutput: inputCost + maxOutputCost,
  };
}

export interface CreateBreakdown {
  beats: number;
  /** Plan, one per beat for dialogue, one per beat for review. */
  calls: number;
  inputTokens: number;
  inputCost: number;
  /** Output the pipeline is actually asking for, not what its caps permit. */
  expectedOutputTokens: number;
  expectedOutputCost: number;
  expected: number;
}

/**
 * What a `create` run is expected to cost.
 *
 * Reported as an expectation rather than a ceiling, which is a change of kind
 * and worth the explanation. When `create` was two calls, the ceiling was a
 * real bound: the caps were the whole spend, and quoting them told an operator
 * the worst case. The pipeline now makes eleven calls, each generously capped
 * so that ordinary verbosity cannot truncate one -- and summing eleven
 * generous caps produces a number nothing will ever approach. It predicted
 * $0.93 for runs that cost $0.42.
 *
 * A figure that is always wrong by half is not conservative, it is ignored. So
 * this prices what the pipeline asks for: the pack, sent once per stage, and
 * the characters the duration budgets.
 *
 * It will still be low when the model overruns its budget, which it reliably
 * does -- by 55% to 96% across the runs measured. The run's own `chars vs
 * budgeted` line reports that overrun as it happens, and `trimToBudget` means
 * the overrun costs output tokens without lengthening the episode.
 */
export function estimateCreateCost(
  request: { system: string; prompt: string },
  prices: PriceList,
  options: { beats: number; characterBudget: number; review: boolean },
): CreateBreakdown {
  const packTokens = estimateTokens(`${request.system}${request.prompt}`);

  // The pack is sent whole to the planner. Dialogue then sends each beat its
  // own excerpts -- which sums to roughly the pack again, since a beat cites a
  // subset and the subsets largely partition it -- and review sends the same
  // material a second time alongside the script.
  const stages = 2 + (options.review ? 1 : 0);
  const inputTokens = packTokens * stages;
  const inputCost = (inputTokens / 1_000_000) * prices.inputPerMillionTokens;

  // Output per character of budget, measured rather than derived.
  //
  // Deriving it failed: the obvious model is "the script, plus a little", which
  // predicted a quarter of the truth. Too much is invisible from here -- the
  // plan's own structure, the overrun the model reliably writes past its
  // budget, and above all revision, which returns a whole rewritten beat every
  // time review finds anything, and review found something in nine of ten
  // beats across two documents.
  //
  // So these are fitted to real runs: 4,181 and 4,228 output tokens with review
  // off, 14,941 and 14,905 with it on, against character budgets near 4,300.
  // Two documents, four runs. Re-fit them from a manifest's `usage.outputTokens`
  // if the model or the prompts change.
  const OUTPUT_TOKENS_PER_CHARACTER = options.review ? 3.45 : 0.97;
  const expectedOutputTokens = Math.round(options.characterBudget * OUTPUT_TOKENS_PER_CHARACTER);
  const expectedOutputCost = (expectedOutputTokens / 1_000_000) * prices.outputPerMillionTokens;

  return {
    beats: options.beats,
    calls: 1 + options.beats * (options.review ? 2 : 1),
    inputTokens,
    inputCost,
    expectedOutputTokens,
    expectedOutputCost,
    expected: inputCost + expectedOutputCost,
  };
}
