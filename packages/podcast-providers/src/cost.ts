/**
 * What an episode costs.
 *
 * The design document settles who pays without ever saying how much, and the
 * revision loop is the term that turns a fixed cost into an unbounded one. This
 * module makes the arithmetic explicit and, more importantly, makes the
 * *measured* cost a recorded artifact rather than an estimate nobody revisits.
 *
 * Prices are configuration, not constants. Provider pricing changes faster than
 * this file would be updated, and a stale hardcoded rate produces confident
 * wrong numbers — worse than no number, because it stops the question being
 * asked.
 */

import { type Usage, ZERO_USAGE, addUsage } from "./ports.ts";

/** Per-unit prices in USD. Supply from configuration; there are no defaults on purpose. */
export interface PriceList {
  /** USD per million input tokens. */
  inputPerMillionTokens: number;
  /** USD per million output tokens. */
  outputPerMillionTokens: number;
  /** USD per million characters of synthesised speech. */
  speechPerMillionCharacters: number;
}

export function costOf(usage: Usage, prices: PriceList): number {
  return (
    (usage.inputTokens / 1_000_000) * prices.inputPerMillionTokens +
    (usage.outputTokens / 1_000_000) * prices.outputPerMillionTokens +
    (usage.speechCharacters / 1_000_000) * prices.speechPerMillionCharacters
  );
}

export interface StageUsage {
  stage: string;
  usage: Usage;
  modelId: string;
}

/**
 * Accumulates usage across a generation run, per stage.
 *
 * Per-stage rather than a single total, because the actionable question is
 * never "what did this episode cost" but "which stage is expensive". Those have
 * different answers and only one of them tells you what to change.
 */
export class UsageLedger {
  readonly entries: StageUsage[] = [];

  record(stage: string, modelId: string, usage: Usage): void {
    this.entries.push({ stage, modelId, usage });
  }

  total(): Usage {
    return this.entries.reduce((sum, entry) => addUsage(sum, entry.usage), ZERO_USAGE);
  }

  /** Totals grouped by stage, so a revision loop's repeats show up as one line. */
  byStage(): Map<string, Usage> {
    const grouped = new Map<string, Usage>();
    for (const entry of this.entries) {
      grouped.set(entry.stage, addUsage(grouped.get(entry.stage) ?? ZERO_USAGE, entry.usage));
    }
    return grouped;
  }

  /** How many times a stage ran. A revision loop shows here before it shows in the bill. */
  callCount(stage: string): number {
    return this.entries.filter((entry) => entry.stage === stage).length;
  }

  totalCost(prices: PriceList): number {
    return costOf(this.total(), prices);
  }
}

/**
 * Estimates the shape of an episode's cost before running one.
 *
 * The point of this function is not precision. It is that the revision loop
 * multiplies the two most expensive stages, and that fact should be visible in
 * a plan rather than discovered in an invoice.
 */
export interface EpisodeEstimateInput {
  /** Tokens in the source pack, paid once per agent that receives it. */
  sourcePackTokens: number;
  /** Agents that receive the full pack. Six in the current design. */
  agentsSeeingFullPack: number;
  /** Tokens of dialogue produced. ~8,000 for a 40-minute episode. */
  dialogueOutputTokens: number;
  /** Rounds of composer-plus-reviewer rework. This is the term that runs away. */
  revisionRounds: number;
  /** Characters synthesised. ~35,000-40,000 for 40 minutes. */
  speechCharacters: number;
}

/**
 * The speech price at which extra revision rounds start costing more than the audio.
 *
 * This exists because the intuitive answer is wrong at premium TTS pricing.
 * The revision loop looks like the runaway term -- it is the only unbounded one
 * -- but audio is a large fixed cost, and at around $100 per million characters
 * a 40-minute episode's synthesis outweighs seven extra rounds of rework.
 *
 * Which flips the advice: at premium voice pricing the primary cost control is
 * **segment-level regeneration**, not the revision cap. Below the break-even
 * this returns, the revision cap matters more. Compute it for your own prices
 * rather than inheriting a conclusion.
 *
 * Returns USD per million characters. Infinity means revisions never dominate
 * at any positive speech price, which happens when the extra rounds are free.
 */
export function revisionBreakEvenSpeechPrice(
  input: EpisodeEstimateInput,
  extraRounds: number,
  textPrices: Pick<PriceList, "inputPerMillionTokens" | "outputPerMillionTokens">,
): number {
  const withRounds = estimateEpisodeUsage({
    ...input,
    revisionRounds: input.revisionRounds + extraRounds,
  });
  const without = estimateEpisodeUsage(input);

  const extraTextCost =
    ((withRounds.inputTokens - without.inputTokens) / 1_000_000) *
      textPrices.inputPerMillionTokens +
    ((withRounds.outputTokens - without.outputTokens) / 1_000_000) *
      textPrices.outputPerMillionTokens;

  if (input.speechCharacters <= 0) return Infinity;
  return extraTextCost / (input.speechCharacters / 1_000_000);
}

export function estimateEpisodeUsage(input: EpisodeEstimateInput): Usage {
  // Each agent pays the pack once; the revision loop re-pays composer and
  // reviewer (two agents) plus re-generates the dialogue, every round.
  const baseInput = input.sourcePackTokens * input.agentsSeeingFullPack;
  const revisionInput = input.sourcePackTokens * 2 * input.revisionRounds;
  const outputTokens = input.dialogueOutputTokens * (1 + input.revisionRounds);

  return {
    inputTokens: baseInput + revisionInput,
    outputTokens,
    speechCharacters: input.speechCharacters,
  };
}
