import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BrokenLlm, FakeLlm, FakeTts } from "./fakes.ts";
import { UsageLedger, costOf, estimateEpisodeUsage, revisionBreakEvenSpeechPrice } from "./cost.ts";
import { createLlm, createTts, withFallback } from "./registry.ts";
import { ZERO_USAGE, addUsage } from "./ports.ts";

const PlanSchema = z.object({ title: z.string(), beats: z.array(z.string()) });

describe("FakeLlm", () => {
  it("validates its queued response against the caller's schema", async () => {
    // A fake that returns whatever the test hands it proves the pipeline works
    // on data the real schema would reject.
    const llm = new FakeLlm([{ title: "Ep 1", beats: ["a"] }, { wrong: true }]);

    await expect(llm.generate({ schema: PlanSchema, system: "s", prompt: "p" })).resolves.toEqual(
      expect.objectContaining({ value: { title: "Ep 1", beats: ["a"] } }),
    );
    await expect(llm.generate({ schema: PlanSchema, system: "s", prompt: "p" })).rejects.toThrow(
      /does not satisfy the caller's schema/,
    );
  });

  it("says how many calls it served before running dry", async () => {
    const llm = new FakeLlm([]);

    await expect(llm.generate({ schema: PlanSchema, system: "s", prompt: "p" })).rejects.toThrow(
      /ran out of responses after 1 call/,
    );
  });
});

describe("withFallback", () => {
  it("moves to the next provider when one fails", async () => {
    const chain = withFallback(new BrokenLlm("a"), new FakeLlm([{ title: "t", beats: [] }]));

    const result = await chain.generate({ schema: PlanSchema, system: "s", prompt: "p" });

    expect(result.value.title).toBe("t");
  });

  it("reports every failure when the chain exhausts, not just the last", async () => {
    const chain = withFallback(new BrokenLlm("first"), new BrokenLlm("second"));

    await expect(chain.generate({ schema: PlanSchema, system: "s", prompt: "p" })).rejects.toThrow(
      /first is unavailable[\s\S]*second is unavailable/,
    );
  });
});

describe("FakeTts", () => {
  it("distinguishes an applied speed from an ignored one", async () => {
    // The failure this guards: a voice director that thinks it is varying pace,
    // against a provider that ignores the control, produces a flat episode and
    // no error anywhere.
    const honouring = new FakeTts();
    const ignoring = new FakeTts();
    ignoring.honoursSpeed = false;

    expect(
      (
        await honouring.synthesise({
          text: "hi",
          voice: "v",
          language: "en-US" as const,
          speed: 1.3,
        })
      ).appliedSpeed,
    ).toBe(1.3);
    expect(
      (
        await ignoring.synthesise({
          text: "hi",
          voice: "v",
          language: "en-US" as const,
          speed: 1.3,
        })
      ).appliedSpeed,
    ).toBeNull();
  });

  it("bills speech per character rather than per token", async () => {
    const tts = new FakeTts();

    const result = await tts.synthesise({
      text: "twelve chars",
      voice: "v",
      language: "en-US" as const,
    });

    expect(result.usage.speechCharacters).toBe(12);
    expect(result.usage.outputTokens).toBe(0);
  });
});

describe("createLlm / createTts", () => {
  it("routes through the gateway when one is configured, and direct otherwise", () => {
    const gateway = { accountId: "acct", gatewayName: "gw" };

    expect(createLlm("anthropic", { apiKey: "k", modelId: "m", gateway }).name).toContain(
      "via AI Gateway",
    );
    expect(createLlm("anthropic", { apiKey: "k", modelId: "m" }).name).not.toContain("Gateway");
  });

  it("builds a speech port from either vendor through the same call", () => {
    // The property that makes swapping TTS vendors configuration rather than
    // code: both providers expose .speech() under one SDK interface.
    expect(createTts("openai", { apiKey: "k", modelId: "tts-1" }).name).toContain("openai");
    expect(createTts("elevenlabs", { apiKey: "k", modelId: "eleven_v3" }).name).toContain(
      "elevenlabs",
    );
  });
});

describe("UsageLedger", () => {
  it("groups by stage, so a revision loop shows as one line with a call count", () => {
    const ledger = new UsageLedger();
    const use = { inputTokens: 100, outputTokens: 50, speechCharacters: 0 };

    ledger.record("compose", "m", use);
    ledger.record("review", "m", use);
    ledger.record("compose", "m", use);

    expect(ledger.callCount("compose")).toBe(2);
    expect(ledger.byStage().get("compose")?.inputTokens).toBe(200);
    expect(ledger.total().outputTokens).toBe(150);
  });

  it("prices a run from a supplied price list", () => {
    const ledger = new UsageLedger();
    ledger.record("compose", "m", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      speechCharacters: 1_000_000,
    });

    expect(
      ledger.totalCost({
        inputPerMillionTokens: 3,
        outputPerMillionTokens: 15,
        speechPerMillionCharacters: 100,
      }),
    ).toBeCloseTo(118, 6);
  });
});

describe("estimateEpisodeUsage", () => {
  const base = {
    sourcePackTokens: 24_183, // measured: module:15 plus one hop
    agentsSeeingFullPack: 6,
    dialogueOutputTokens: 8_000,
    speechCharacters: 38_000,
  };

  it("shows the revision loop multiplying the expensive stages", () => {
    const clean = estimateEpisodeUsage({ ...base, revisionRounds: 0 });
    const twoRounds = estimateEpisodeUsage({ ...base, revisionRounds: 2 });

    expect(twoRounds.inputTokens).toBeGreaterThan(clean.inputTokens);
    expect(twoRounds.outputTokens).toBe(clean.outputTokens * 3);
  });

  it("leaves speech untouched by revisions, because audio is synthesised once", () => {
    // Only true because synthesis happens after approval. If that order ever
    // changes, this assertion should fail and force the estimate to change too.
    const clean = estimateEpisodeUsage({ ...base, revisionRounds: 0 });
    const many = estimateEpisodeUsage({ ...base, revisionRounds: 5 });

    expect(many.speechCharacters).toBe(clean.speechCharacters);
  });

  // This test was first written asserting that eight revision rounds cost more
  // than double one round. It failed: 6.48 against 9.24. The reason is the
  // interesting part, and it contradicts the obvious reading of the design --
  // the revision loop is the only *unbounded* term, so it looks like the one
  // that matters, but at premium voice pricing audio dominates so heavily that
  // rework is second-order.
  it("is dominated by speech, not by the revision loop, at premium voice pricing", () => {
    const prices = {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
      speechPerMillionCharacters: 100,
    };

    const clean = estimateEpisodeUsage({ ...base, revisionRounds: 0 });
    const speechOnly = costOf(
      { inputTokens: 0, outputTokens: 0, speechCharacters: clean.speechCharacters },
      prices,
    );

    // 87% of a clean episode is audio.
    expect(speechOnly / costOf(clean, prices)).toBeGreaterThan(0.85);

    // And seven extra rounds of rework cost less than one synthesis.
    const oneRound = costOf(estimateEpisodeUsage({ ...base, revisionRounds: 1 }), prices);
    const eightRounds = costOf(estimateEpisodeUsage({ ...base, revisionRounds: 8 }), prices);
    expect(eightRounds - oneRound).toBeLessThan(speechOnly);
  });

  it("finds the speech price below which the revision loop does dominate", () => {
    const textPrices = { inputPerMillionTokens: 3, outputPerMillionTokens: 15 };

    const breakEven = revisionBreakEvenSpeechPrice({ ...base, revisionRounds: 1 }, 7, textPrices);

    // Around $49/M characters. Above it, control audio re-synthesis; below it,
    // cap the loop. Neither piece of advice is right on its own.
    expect(breakEven).toBeGreaterThan(40);
    expect(breakEven).toBeLessThan(60);
  });

  it("reports no break-even when nothing is synthesised", () => {
    const breakEven = revisionBreakEvenSpeechPrice(
      { ...base, speechCharacters: 0, revisionRounds: 1 },
      7,
      { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
    );

    expect(breakEven).toBe(Infinity);
  });
});

describe("usage arithmetic", () => {
  it("adds to zero cleanly", () => {
    const use = { inputTokens: 5, outputTokens: 7, speechCharacters: 9 };

    expect(addUsage(ZERO_USAGE, use)).toEqual(use);
  });
});
