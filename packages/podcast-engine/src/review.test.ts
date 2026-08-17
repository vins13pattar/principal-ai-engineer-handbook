import { describe, expect, it } from "vitest";
import { FakeLlm } from "@handbook/podcast-providers";
import type { SourceExcerpt } from "@handbook/content";
import { buildReviewRequest, buildRevisionRequest, reviewBeat } from "./review.ts";
import type { Finding } from "./review.ts";
import type { PlannedBeat } from "./schema.ts";

const beat: PlannedBeat = {
  title: "Where the trust goes",
  intent: "Land the security boundary",
  excerptIds: ["doc#security"],
  weight: 1,
  targetSeconds: 60,
  allocatedCharacters: 500,
};

const sources = new Map<string, SourceExcerpt>([
  [
    "doc#security",
    {
      documentId: "doc",
      url: "/doc/",
      title: "Doc",
      heading: "Security",
      body: "Tool descriptions are part of the model's context.",
    },
  ],
]);

const turns = [
  { speaker: "host" as const, text: "Where does the trust actually sit?" },
  { speaker: "guest" as const, text: "Tool descriptions reach the model as context." },
];

const clean = { findings: [] };

describe("buildReviewRequest", () => {
  it("shows the turns indexed, so a finding can point at one", () => {
    const request = buildReviewRequest(beat, turns, sources, [], 2000);

    expect(request.prompt).toContain("[0] host:");
    expect(request.prompt).toContain("[1] guest:");
  });

  it("sends the sources the beat is allowed to draw on", () => {
    const request = buildReviewRequest(beat, turns, sources, [], 2000);

    expect(request.prompt).toContain("Tool descriptions are part of the model's context.");
    expect(request.prompt).toContain("only sources this segment may draw on");
  });

  it("names the earlier segments, which is what makes repetition detectable", () => {
    // Per-beat generation means no call sees another call's text. Without this
    // list, nothing in the pipeline can notice the same explanation twice.
    const request = buildReviewRequest(beat, turns, sources, ["The integration problem"], 2000);

    expect(request.prompt).toContain("The integration problem");
    expect(request.prompt).toContain("already covered");
  });
});

describe("buildRevisionRequest", () => {
  it("carries each finding with its turn and its reason", () => {
    const findings: Finding[] = [
      { turn: 1, problem: "unsupported", detail: "the excerpts never mention latency" },
    ];

    const request = buildRevisionRequest(beat, turns, findings, sources, 2000);

    expect(request.prompt).toContain("turn 1 (unsupported): the excerpts never mention latency");
    expect(request.prompt).toContain("Return all 2 turns");
  });
});

describe("reviewBeat", () => {
  it("costs one call and changes nothing when the beat is clean", async () => {
    // The expected result. A review that always finds something would make
    // every episode cost double for no gain.
    const llm = new FakeLlm([clean]);

    const result = await reviewBeat(beat, turns, sources, [], llm, 2000);

    expect(llm.calls).toHaveLength(1);
    expect(result.revised).toBe(false);
    expect(result.turns).toEqual(turns);
    expect(result.findings).toEqual([]);
  });

  it("revises only when something was found", async () => {
    const fixed = {
      turns: [
        { speaker: "host", text: "Where does the trust actually sit?" },
        { speaker: "guest", text: "Tool descriptions are part of the model's context." },
      ],
    };
    const llm = new FakeLlm([
      { findings: [{ turn: 1, problem: "unsupported", detail: "latency is not in the excerpts" }] },
      fixed,
    ]);

    const result = await reviewBeat(beat, turns, sources, [], llm, 2000);

    expect(llm.calls).toHaveLength(2);
    expect(result.revised).toBe(true);
    expect(result.turns[1]!.text).toBe("Tool descriptions are part of the model's context.");
    expect(result.findings).toHaveLength(1);
  });

  it("sums both calls' usage", async () => {
    const llm = new FakeLlm([
      { findings: [{ turn: 0, problem: "unspeakable", detail: "reads a URL aloud" }] },
      { turns },
    ]);

    const result = await reviewBeat(beat, turns, sources, [], llm, 2000);

    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(result.usage.speechCharacters).toBe(0);
  });

  it("drops a finding pointing at a turn that does not exist", async () => {
    // A reviewer that miscounts has made a bookkeeping error. Discarding the
    // episode over it costs far more than ignoring the finding.
    const llm = new FakeLlm([
      { findings: [{ turn: 7, problem: "repeats", detail: "already said in segment 1" }] },
    ]);

    const result = await reviewBeat(beat, turns, sources, [], llm, 2000);

    expect(llm.calls).toHaveLength(1);
    expect(result.revised).toBe(false);
    expect(result.findings).toEqual([]);
  });
});
