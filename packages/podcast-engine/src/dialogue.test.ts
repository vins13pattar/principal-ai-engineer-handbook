import { describe, expect, it } from "vitest";
import { FakeLlm } from "@handbook/podcast-providers";
import type { SourcePack } from "@handbook/content";
import {
  assertDialogueFits,
  buildDialogueRequest,
  projectOutputTokens,
  turnsForCharacters,
  scriptCharacters,
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

const goodScript: DialogueScript = {
  turns: [
    { speaker: "host", beat: 1, text: "Why do small evaluation sets mislead?" },
    { speaker: "guest", beat: 1, text: "Because the noise is larger than the effect." },
  ],
};

describe("renderDialoguePrompt", () => {
  it("budgets each beat in turns, which the model can count", () => {
    const { prompt } = buildDialogueRequest(plan(), sources, {
      charsPerSecond: 16,
      maxOutputTokens: 4000,
    });

    // 60s at 16 chars/s is 960 characters, which is 3 turns of ~300. Character
    // budgets were tried first and overrun by 48% and 57% on real runs: a model
    // cannot count the characters it is emitting, so the number was readable
    // and not applicable.
    expect(prompt).toContain("Write 3 turns for this beat");
    expect(prompt).toContain("6 turns, alternating host and guest");
    expect(prompt).toContain("Two or three sentences per turn");
    expect(prompt).toContain("Setup");
    expect(prompt).toContain("Payoff");
  });

  it("never asks for zero turns, however thin the beat", () => {
    // A beat allocated almost no time still has to be spoken or not exist.
    // "Write 0 turns" is an instruction with no correct execution.
    expect(turnsForCharacters(1)).toBe(1);
    expect(turnsForCharacters(0)).toBe(1);
    expect(turnsForCharacters(450)).toBe(2);
  });

  it("includes the body of every cited excerpt", () => {
    const { prompt } = buildDialogueRequest(plan(), sources, {
      charsPerSecond: 16,
      maxOutputTokens: 4000,
    });

    expect(prompt).toContain("Small evaluation sets report noise as signal.");
    expect(prompt).toContain("Confidence intervals are the fix.");
  });

  it("names what the planner could not source, as material to avoid", () => {
    const { prompt } = buildDialogueRequest(plan({ unsupported: ["a cost comparison"] }), sources, {
      charsPerSecond: 16,
      maxOutputTokens: 4000,
    });

    expect(prompt).toContain("a cost comparison");
    expect(prompt).toContain("Do not write them");
  });

  it("carries the token bound onto the request", () => {
    const request = buildDialogueRequest(plan(), sources, {
      charsPerSecond: 16,
      maxOutputTokens: 1234,
    });

    expect(request.maxOutputTokens).toBe(1234);
    expect(request.system.length).toBeGreaterThan(0);
  });
});

describe("assertDialogueFits", () => {
  it("refuses before the call when the bound cannot hold the script", () => {
    // 9720 characters is a 10-minute episode at 16.2 chars/s. It needs ~3280
    // output tokens; a 2000-token bound truncates the JSON mid-string, and the
    // resulting error blames the model for a configuration mistake.
    expect(() => assertDialogueFits(9720, 2000, 600)).toThrow(/maxOutputTokens is 2000/);
    expect(() => assertDialogueFits(9720, 2000, 600)).toThrow(/shorter --duration/);
  });

  it("allows a script the bound can hold", () => {
    expect(() => assertDialogueFits(9720, 4000, 600)).not.toThrow();
  });

  it("prices JSON scaffolding, not just prose", () => {
    // Four chars per token would say 1000; the wrapper per turn and the escaped
    // punctuation are what make a bound that looks sufficient truncate.
    expect(projectOutputTokens(4000)).toBe(1350);
  });
});

describe("validateSpeakers", () => {
  it("rejects a monologue that satisfies the two-turn schema", () => {
    const monologue: DialogueScript = {
      turns: [
        { speaker: "host", beat: 1, text: "First." },
        { speaker: "host", beat: 1, text: "Second." },
      ],
    };

    expect(() => validateSpeakers(monologue)).toThrow(/only the host speaks/);
  });

  it("accepts a genuine two-hander", () => {
    expect(() => validateSpeakers(goodScript)).not.toThrow();
  });
});

describe("writeDialogue", () => {
  it("returns the script, its usage, and the model that answered", async () => {
    const llm = new FakeLlm([goodScript]);

    const result = await writeDialogue(plan(), sources, llm, {
      charsPerSecond: 16,
      maxOutputTokens: 4000,
    });

    expect(result.script.turns).toHaveLength(2);
    expect(result.modelId).toBe("fake-llm");
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(llm.calls).toHaveLength(1);
  });

  it("spends nothing when the bound cannot hold the episode", async () => {
    const llm = new FakeLlm([goodScript]);

    await expect(
      writeDialogue(plan({ plannedSeconds: 1800 }), sources, llm, {
        charsPerSecond: 16,
        maxOutputTokens: 4000,
      }),
    ).rejects.toThrow(/maxOutputTokens/);

    expect(llm.calls).toHaveLength(0);
  });

  it("rejects a one-voice script after the call", async () => {
    const llm = new FakeLlm([
      {
        turns: [
          { speaker: "guest", beat: 1, text: "One." },
          { speaker: "guest", beat: 1, text: "Two." },
        ],
      },
    ]);

    await expect(
      writeDialogue(plan(), sources, llm, { charsPerSecond: 16, maxOutputTokens: 4000 }),
    ).rejects.toThrow(/only the guest speaks/);
  });
});

describe("scriptCharacters", () => {
  it("counts what will be submitted for synthesis", () => {
    expect(scriptCharacters(goodScript)).toBe(
      goodScript.turns[0]!.text.length + goodScript.turns[1]!.text.length,
    );
  });
});
