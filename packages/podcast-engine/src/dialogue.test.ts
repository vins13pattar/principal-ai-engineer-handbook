import { describe, expect, it } from "vitest";
import { FakeLlm } from "@handbook/podcast-providers";
import type { SourcePack } from "@handbook/content";
import {
  beatOutputTokens,
  projectOutputTokens,
  scriptCharacters,
  turnsForCharacters,
  validateSpeakers,
  writeDialogue,
} from "./dialogue.ts";
import type { DialogueScript } from "./dialogue.ts";
import type { EpisodePlan } from "./schema.ts";

function pack(sections: Array<[string, string]>): SourcePack {
  return {
    topic: "Evaluation",
    primary: {
      documentId: "doc",
      url: "/doc/",
      sourcePath: "doc.mdx",
      title: "Doc",
      version: "1.0.0",
      lastUpdated: "2026-08-16",
    },
    related: [],
    excerpts: sections.map(([heading, body]) => ({
      documentId: "doc",
      url: "/doc/",
      title: "Doc",
      heading,
      body,
    })),
    sourceHash: "hash-abc",
    estimatedTokens: 100,
    droppedForBudget: [],
  };
}

function plan(overrides: Partial<EpisodePlan> = {}): EpisodePlan {
  return {
    topic: "Evaluation",
    title: "Measuring what you cannot see",
    throughLine: "A small evaluation set reports noise as signal.",
    beats: [
      {
        title: "Setup",
        intent: "Frame the problem",
        excerptIds: ["doc#alpha"],
        weight: 1,
        targetSeconds: 60,
        allocatedCharacters: 500,
      },
      {
        title: "Payoff",
        intent: "Land the argument",
        excerptIds: ["doc#beta"],
        weight: 1,
        targetSeconds: 60,
        allocatedCharacters: 500,
      },
    ],
    requestedSeconds: 120,
    plannedSeconds: 120,
    unsupported: [],
    shortfall: null,
    segmentBudget: {
      maxSegments: 10,
      ceilingSeconds: 300,
      projectedSeconds: 40,
      basis: { fixedSeconds: 3.16, marginalRtf: 0.073 },
    },
    sourceHash: "hash-abc",
    droppedForBudget: [],
    ...overrides,
  };
}

const sources = pack([
  ["Alpha", "Small evaluation sets report noise as signal."],
  ["Beta", "Confidence intervals are the fix."],
]);

const options = { charsPerSecond: 16, maxOutputTokens: 16_000 };

/** One answer per beat, in order. */
function beatAnswers() {
  return [
    {
      turns: [
        { speaker: "host", text: "Why do small evaluation sets mislead?" },
        { speaker: "guest", text: "Because the noise is larger than the effect." },
      ],
    },
    {
      turns: [
        { speaker: "host", text: "So what fixes it?" },
        { speaker: "guest", text: "Confidence intervals, reported alongside the number." },
      ],
    },
  ];
}

describe("writeDialogue", () => {
  it("makes one call per beat", async () => {
    // The whole-episode call could not be bounded: output length varied
    // enormously for an identical request, and two of six real runs died on
    // truncation. Per beat, the cap is per beat.
    const llm = new FakeLlm(beatAnswers());

    await writeDialogue(plan(), sources, llm, options);

    expect(llm.calls).toHaveLength(2);
  });

  it("stamps each turn with the beat it was written for", async () => {
    // Assigned by the engine, not asked of the model: the caller knows which
    // beat it requested, and a model mis-tagging its own turns would distort
    // the trim that depends on those numbers.
    const llm = new FakeLlm(beatAnswers());

    const { script } = await writeDialogue(plan(), sources, llm, options);

    expect(script.turns.map((turn) => turn.beat)).toEqual([1, 1, 2, 2]);
  });

  it("sends each beat only the excerpts it cites", async () => {
    // The reason this is cheaper than one whole-episode call: a beat needs its
    // own sources, not the entire pack.
    const llm = new FakeLlm(beatAnswers());

    await writeDialogue(plan(), sources, llm, options);

    expect(llm.calls[0]!.prompt).toContain("Small evaluation sets report noise as signal.");
    expect(llm.calls[0]!.prompt).not.toContain("Confidence intervals are the fix.");
    expect(llm.calls[1]!.prompt).toContain("Confidence intervals are the fix.");
  });

  it("tells each beat what came before, so nobody re-introduces the show", async () => {
    const llm = new FakeLlm(beatAnswers());

    await writeDialogue(plan(), sources, llm, options);

    expect(llm.calls[0]!.prompt).toContain("opening segment");
    expect(llm.calls[1]!.prompt).toContain("Already covered");
    expect(llm.calls[1]!.prompt).toContain("Setup");
    // And the actual last line, so the next segment can pick up from it.
    expect(llm.calls[1]!.prompt).toContain("Because the noise is larger than the effect.");
  });

  it("tells the last beat to close the episode", async () => {
    const llm = new FakeLlm(beatAnswers());

    await writeDialogue(plan(), sources, llm, options);

    expect(llm.calls[0]!.prompt).not.toContain("final segment");
    expect(llm.calls[1]!.prompt).toContain("final segment");
  });

  it("accumulates usage across every call", async () => {
    const single = await writeDialogue(
      plan({ beats: plan().beats.slice(0, 1) }),
      sources,
      new FakeLlm(beatAnswers().slice(0, 1)),
      options,
    );
    const both = await writeDialogue(plan(), sources, new FakeLlm(beatAnswers()), options);

    expect(both.usage.outputTokens).toBeGreaterThan(single.usage.outputTokens);
    expect(both.modelId).toBe("fake-llm");
  });

  it("names the beat that failed", async () => {
    // With one call per beat, "the dialogue stage failed" no longer says which
    // part of the episode to look at.
    const llm = new FakeLlm([beatAnswers()[0]!]);

    await expect(writeDialogue(plan(), sources, llm, options)).rejects.toThrow(
      /beat 2 of 2 \("Payoff"\) failed/,
    );
  });

  it("rejects a script where only one voice ever speaks", async () => {
    const llm = new FakeLlm([
      { turns: [{ speaker: "guest", text: "One." }] },
      { turns: [{ speaker: "guest", text: "Two." }] },
    ]);

    await expect(writeDialogue(plan(), sources, llm, options)).rejects.toThrow(
      /only the guest speaks/,
    );
  });
});

describe("beatOutputTokens", () => {
  it("asks for far more than the projection, because a cap only costs when hit", () => {
    // The observed runaway reached six times budget. A cap sitting just above
    // the expected length turns ordinary verbosity into a failed run.
    expect(beatOutputTokens(840, 16_000)).toBe(projectOutputTokens(840) * 6);
  });

  it("never exceeds the operator's configured ceiling", () => {
    expect(beatOutputTokens(100_000, 4000)).toBe(4000);
  });

  it("leaves a short beat room for a complete object", () => {
    expect(beatOutputTokens(10, 16_000)).toBe(1000);
  });
});

describe("turnsForCharacters", () => {
  it("converts a character budget into a countable unit", () => {
    expect(turnsForCharacters(960)).toBe(3);
    expect(turnsForCharacters(450)).toBe(2);
  });

  it("never asks for zero turns, however thin the beat", () => {
    expect(turnsForCharacters(1)).toBe(1);
    expect(turnsForCharacters(0)).toBe(1);
  });
});

describe("projectOutputTokens", () => {
  it("prices JSON scaffolding, not just prose", () => {
    expect(projectOutputTokens(4000)).toBe(1350);
  });
});

describe("validateSpeakers", () => {
  it("rejects a monologue", () => {
    const monologue: DialogueScript = {
      turns: [
        { speaker: "host", beat: 1, text: "First." },
        { speaker: "host", beat: 1, text: "Second." },
      ],
    };

    expect(() => validateSpeakers(monologue)).toThrow(/only the host speaks/);
  });
});

describe("scriptCharacters", () => {
  it("counts what will be submitted for synthesis", () => {
    const script: DialogueScript = {
      turns: [
        { speaker: "host", beat: 1, text: "abc" },
        { speaker: "guest", beat: 1, text: "de" },
      ],
    };

    expect(scriptCharacters(script)).toBe(5);
  });
});
