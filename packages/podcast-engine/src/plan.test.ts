import { describe, expect, it } from "vitest";
import { FakeLlm } from "@handbook/podcast-providers";
import type { StructuredRequest } from "@handbook/podcast-providers";
import type { SourcePack } from "@handbook/content";
import { beatsForSeconds, buildPlanRequest, planEpisode } from "./plan.ts";
import type { PlanBudget } from "./budget.ts";

function pack(sections: Array<[string, number]>): SourcePack {
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
    excerpts: sections.map(([heading, characters]) => ({
      documentId: "doc",
      url: "/doc/",
      title: "Doc",
      heading,
      body: "x".repeat(characters),
    })),
    sourceHash: "hash-abc",
    estimatedTokens: 100,
    readingSeconds: 600,
    droppedForBudget: ["lab:semantic-cache"],
  };
}

function budget(overrides: Partial<PlanBudget> = {}): PlanBudget {
  return {
    requestedSeconds: 100,
    expansionFactor: 1,
    charsPerSecond: 1,
    maxRenderSeconds: 300,
    synthesisCost: { fixedSeconds: 3.16, marginalRtf: 0.073 },
    ...overrides,
  };
}

const goodDraft = {
  title: "Measuring what you cannot see",
  throughLine: "A small evaluation set reports noise as signal.",
  beats: [
    { title: "Setup", intent: "Frame it", excerptIds: ["doc#alpha"], weight: 1 },
    { title: "Payoff", intent: "Land it", excerptIds: ["doc#beta"], weight: 1 },
  ],
  unsupported: [],
};

describe("buildPlanRequest", () => {
  it("returns the ids it derived alongside the request", () => {
    // Returning both is what stops a caller pairing a prompt with ids from a
    // different array. apportion already guards that invariant; there is no
    // reason to create a second place it can go wrong.
    const { request, excerptIds } = buildPlanRequest(
      pack([
        ["Alpha", 200],
        ["Beta", 200],
      ]),
      { maxOutputTokens: 4000, requestedSeconds: 300 },
    );

    expect(excerptIds).toEqual(["doc#alpha", "doc#beta"]);
    for (const id of excerptIds) expect(request.prompt).toContain(id);
  });

  it("carries the system prompt and the token bound", () => {
    // The estimator prices this exact request. A system prompt missing here is
    // an estimate priced against text the model never receives.
    const { request } = buildPlanRequest(pack([["Alpha", 200]]), {
      maxOutputTokens: 1234,
      requestedSeconds: 300,
    });

    expect(request.system.length).toBeGreaterThan(0);
    expect(request.maxOutputTokens).toBe(1234);
  });

  it("asks for a beat count proportional to the episode", () => {
    // A real 300-second run came back with 11 beats -- 27 seconds each, two
    // turns before the subject changes. Unconstrained, the model plans one
    // beat per excerpt heading regardless of how long the episode is.
    const { request } = buildPlanRequest(pack([["Alpha", 200]]), {
      maxOutputTokens: 4000,
      requestedSeconds: 300,
    });

    expect(request.prompt).toContain("Plan 5 beats");
    expect(request.prompt).toContain("about 300 seconds");
  });
});

describe("beatsForSeconds", () => {
  it("gives every beat about a minute", () => {
    expect(beatsForSeconds(300)).toBe(5);
    expect(beatsForSeconds(600)).toBe(10);
  });

  it("keeps a short episode from collapsing to one beat", () => {
    // Even 90 seconds needs an opening, a middle, and a close; a single-beat
    // plan has no arc to apportion.
    expect(beatsForSeconds(90)).toBe(3);
    expect(beatsForSeconds(30)).toBe(3);
  });

  it("keeps a long episode from becoming a list", () => {
    // Past a dozen segments the arc is a list again, however long each gets.
    expect(beatsForSeconds(2400)).toBe(12);
  });
});

describe("planEpisode", () => {
  it("produces a plan and carries the pack's provenance forward", async () => {
    const llm = new FakeLlm([goodDraft]);

    const { plan, modelId, usage } = await planEpisode(
      pack([
        ["Alpha", 200],
        ["Beta", 200],
      ]),
      budget(),
      llm,
      { maxOutputTokens: 4000 },
    );

    expect(plan.title).toBe("Measuring what you cannot see");
    expect(plan.beats).toHaveLength(2);
    expect(plan.sourceHash).toBe("hash-abc");
    expect(plan.droppedForBudget).toEqual(["lab:semantic-cache"]);
    expect(plan.segmentBudget.maxSegments).toBeGreaterThan(0);
    expect(modelId).toBe("fake-llm");
    expect(usage.outputTokens).toBeGreaterThan(0);
  });

  it("puts every derived id in the prompt so the model can cite them", async () => {
    const llm = new FakeLlm([goodDraft]);

    await planEpisode(
      pack([
        ["Alpha", 200],
        ["Beta", 200],
      ]),
      budget(),
      llm,
      { maxOutputTokens: 4000 },
    );

    expect(llm.calls[0]!.prompt).toContain("doc#alpha");
    expect(llm.calls[0]!.prompt).toContain("doc#beta");
  });

  it("rejects a citation that is not in the pack, naming it", async () => {
    // Zod validates shape; shape cannot tell a real id from a plausible one.
    const llm = new FakeLlm([
      {
        ...goodDraft,
        beats: [{ title: "Setup", intent: "i", excerptIds: ["doc#invented"], weight: 1 }],
      },
    ]);

    await expect(
      planEpisode(pack([["Alpha", 200]]), budget(), llm, { maxOutputTokens: 4000 }),
    ).rejects.toThrow(/doc#invented/);
  });

  it("rejects invented citations mixed with a valid one, naming all invented ids", async () => {
    // A single bad id doesn't pin that validateCitations counts every invented
    // id rather than short-circuiting on the first; this uses one valid id and
    // two invented ones.
    const llm = new FakeLlm([
      {
        ...goodDraft,
        beats: [
          {
            title: "Setup",
            intent: "i",
            excerptIds: ["doc#alpha", "doc#invented-one", "doc#invented-two"],
            weight: 1,
          },
        ],
      },
    ]);

    await expect(
      planEpisode(
        pack([
          ["Alpha", 200],
          ["Beta", 200],
        ]),
        budget(),
        llm,
        { maxOutputTokens: 4000 },
      ),
    ).rejects.toThrow(/doc#invented-one.*doc#invented-two/);
  });

  it("refuses an empty pack without calling the model", async () => {
    const llm = new FakeLlm([goodDraft]);

    await expect(planEpisode(pack([]), budget(), llm, { maxOutputTokens: 4000 })).rejects.toThrow(
      /no excerpts/,
    );
    expect(llm.calls).toHaveLength(0);
  });

  it("refuses a pack whose excerpts are all empty without calling the model", async () => {
    const llm = new FakeLlm([goodDraft]);

    await expect(
      planEpisode(pack([["Alpha", 0]]), budget(), llm, { maxOutputTokens: 4000 }),
    ).rejects.toThrow(/no excerpts/);
    expect(llm.calls).toHaveLength(0);
  });

  // Every one of the six numeric requirements must reject before the model is
  // called. Task 3's tests prove the validation logic; only this proves the
  // ordering, and ordering is the whole point of validating up front.
  it.each([
    ["requestedSeconds", { requestedSeconds: 0 }],
    ["expansionFactor", { expansionFactor: 0 }],
    ["charsPerSecond", { charsPerSecond: 0 }],
    ["maxRenderSeconds", { maxRenderSeconds: 0 }],
    ["fixedSeconds", { synthesisCost: { fixedSeconds: 0, marginalRtf: 0.073 } }],
    ["marginalRtf", { synthesisCost: { fixedSeconds: 3.16, marginalRtf: -0.1 } }],
  ] as Array<[string, Partial<PlanBudget>]>)(
    "refuses an invalid %s without calling the model",
    async (field, override) => {
      const llm = new FakeLlm([goodDraft]);

      await expect(
        planEpisode(pack([["Alpha", 200]]), budget(override), llm, { maxOutputTokens: 4000 }),
      ).rejects.toThrow(field);
      expect(llm.calls).toHaveLength(0);
    },
  );

  it("keeps the model's reported gaps visible when the computed shortfall is null", async () => {
    // The two are independent channels. A naive implementation drops one
    // because the other looks clean.
    const llm = new FakeLlm([
      { ...goodDraft, unsupported: ["nothing covers rollout or failure modes"] },
    ]);

    const { plan } = await planEpisode(
      pack([
        ["Alpha", 500],
        ["Beta", 500],
      ]),
      budget(),
      llm,
      { maxOutputTokens: 4000 },
    );

    expect(plan.shortfall).toBeNull();
    expect(plan.unsupported).toEqual(["nothing covers rollout or failure modes"]);
  });

  it("records a shortfall when the pack cannot support the request", async () => {
    const llm = new FakeLlm([goodDraft]);

    const { plan } = await planEpisode(
      pack([
        ["Alpha", 95],
        ["Beta", 5],
      ]),
      budget(),
      llm,
      { maxOutputTokens: 4000 },
    );

    expect(plan.plannedSeconds).toBeLessThan(plan.requestedSeconds);
    expect(plan.shortfall).not.toBeNull();
    expect(plan.shortfall!.thinBeats.length).toBeGreaterThan(0);
  });

  it("sends the token bound to the model", async () => {
    // The bound was advertised in the estimate and never applied. This is the
    // assertion that makes it real.
    const llm = new FakeLlm([goodDraft]);
    const seen: Array<number | undefined> = [];
    const recording = {
      name: "recording",
      generate: async <T>(request: StructuredRequest<T>) => {
        seen.push(request.maxOutputTokens);
        return llm.generate(request);
      },
    };

    await planEpisode(
      pack([
        ["Alpha", 200],
        ["Beta", 200],
      ]),
      budget(),
      recording,
      { maxOutputTokens: 4000 },
    );

    expect(seen).toEqual([4000]);
  });
});
