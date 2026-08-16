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
