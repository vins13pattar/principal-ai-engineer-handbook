/**
 * Print the episode cost model for a set of prices.
 *
 *   node --experimental-strip-types packages/podcast-providers/src/cli.ts
 *   node --experimental-strip-types packages/podcast-providers/src/cli.ts 3 15 100
 *
 * Arguments are USD per million input tokens, output tokens, and speech
 * characters. Supply your providers' real prices -- the defaults below are
 * illustrative, and the conclusion is sensitive to the speech price.
 */

import { estimateEpisodeUsage, costOf, revisionBreakEvenSpeechPrice } from "./cost.ts";

const prices = {
  inputPerMillionTokens: Number(process.argv[2] ?? 3),
  outputPerMillionTokens: Number(process.argv[3] ?? 15),
  speechPerMillionCharacters: Number(process.argv[4] ?? 100),
};

// Source pack size is measured, not guessed: module:15 plus one hop of related
// pages, per `pnpm --filter @handbook/content` CLI.
const base = {
  sourcePackTokens: 24_183,
  agentsSeeingFullPack: 6,
  dialogueOutputTokens: 8_000,
  speechCharacters: 38_000,
};

console.log(
  `prices: $${prices.inputPerMillionTokens}/M in, $${prices.outputPerMillionTokens}/M out, ` +
    `$${prices.speechPerMillionCharacters}/M speech chars\n`,
);
console.log("rounds |    LLM |  speech |   total | speech share");
for (const revisionRounds of [0, 1, 2, 4, 8]) {
  const usage = estimateEpisodeUsage({ ...base, revisionRounds });
  const speech = costOf(
    { inputTokens: 0, outputTokens: 0, speechCharacters: usage.speechCharacters },
    prices,
  );
  const total = costOf(usage, prices);
  const share = total > 0 ? (speech / total) * 100 : 0;
  console.log(
    `${String(revisionRounds).padStart(6)} | ${`$${(total - speech).toFixed(2)}`.padStart(6)} | ` +
      `${`$${speech.toFixed(2)}`.padStart(7)} | ${`$${total.toFixed(2)}`.padStart(7)} | ` +
      `${share.toFixed(0).padStart(11)}%`,
  );
}

const breakEven = revisionBreakEvenSpeechPrice({ ...base, revisionRounds: 1 }, 7, prices);
console.log(
  `\nSeven extra revision rounds outweigh the audio only below ` +
    `$${breakEven.toFixed(0)}/M speech characters.`,
);
console.log(
  prices.speechPerMillionCharacters > breakEven
    ? "At these prices: control audio re-synthesis first. The revision cap is second-order."
    : "At these prices: cap the revision loop first. It outweighs the audio.",
);
