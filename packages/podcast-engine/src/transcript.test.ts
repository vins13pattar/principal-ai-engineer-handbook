import { describe, expect, it } from "vitest";
import { renderTranscript } from "./transcript.ts";
import type { DialogueScript } from "./dialogue.ts";
import type { EpisodePlan } from "./schema.ts";

function plan(overrides: Partial<EpisodePlan> = {}): EpisodePlan {
  return {
    topic: "MCP",
    title: "A transport contract, not a capability",
    throughLine: "MCP standardised the connection and moved the trust question.",
    beats: [
      {
        title: "The integration problem",
        intent: "Frame it",
        excerptIds: ["doc#a"],
        weight: 1,
        targetSeconds: 60,
        allocatedCharacters: 500,
      },
      {
        title: "Where the trust goes",
        intent: "Land it",
        excerptIds: ["doc#b"],
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
    sourceHash: "hash",
    droppedForBudget: [],
    ...overrides,
  };
}

const script: DialogueScript = {
  turns: [
    { speaker: "host", beat: 1, text: "What did MCP replace?" },
    { speaker: "guest", beat: 1, text: "A bespoke integration per application." },
    { speaker: "host", beat: 2, text: "And the security boundary?" },
    { speaker: "guest", beat: 2, text: "Tool descriptions are part of the model's context." },
  ],
};

const meta = {
  documentId: "module:06-mcp",
  url: "/learn/modules/06-mcp/",
  modelId: "claude-sonnet-5",
  generated: "2026-08-22",
  voices: { host: "af_heart", guest: "am_michael" },
  audioSeconds: 1346.7,
};

describe("renderTranscript", () => {
  it("labels every turn so another provider can split by speaker", () => {
    // The one hard requirement of the format. ElevenLabs and Sarvam take plain
    // text per voice, so a script must be able to extract one speaker's lines
    // without parsing prose.
    const text = renderTranscript(plan(), script, meta);

    const guest = text.split("\n").filter((line) => line.startsWith("**Guest:**"));
    expect(guest).toHaveLength(2);
    expect(guest[0]).toContain("A bespoke integration per application.");
    expect(text.split("\n").filter((line) => line.startsWith("**Host:**"))).toHaveLength(2);
  });

  it("records what produced the audio", () => {
    // A transcript outlives its run directory. Without this it is a wall of
    // dialogue nobody can source.
    const text = renderTranscript(plan(), script, meta);

    expect(text).toContain("[module:06-mcp](/learn/modules/06-mcp/)");
    expect(text).toContain("claude-sonnet-5");
    expect(text).toContain("af_heart (host), am_michael (guest)");
    expect(text).toContain("22:27");
    expect(text).toContain("4 turns");
  });

  it("says the voices are synthetic", () => {
    expect(renderTranscript(plan(), script, meta)).toContain("not a recorded conversation");
  });

  it("groups turns under their beat, in order", () => {
    const text = renderTranscript(plan(), script, meta);

    expect(text.indexOf("## 1. The integration problem")).toBeLessThan(
      text.indexOf("## 2. Where the trust goes"),
    );
    expect(text.indexOf("What did MCP replace?")).toBeLessThan(
      text.indexOf("And the security boundary?"),
    );
  });

  it("skips a beat that received no turns", () => {
    // The heading would promise a segment the episode does not contain.
    const text = renderTranscript(plan(), { turns: script.turns.slice(0, 2) }, meta);

    expect(text).toContain("## 1. The integration problem");
    expect(text).not.toContain("## 2. Where the trust goes");
  });

  it("says when the runtime was never measured", () => {
    const text = renderTranscript(plan(), script, { ...meta, audioSeconds: null });

    expect(text).toContain("unmeasured");
  });

  it("carries what the planner could not source", () => {
    const text = renderTranscript(plan({ unsupported: ["adoption data"] }), script, meta);

    expect(text).toContain("## Not covered");
    expect(text).toContain("- adoption data");
  });
});
