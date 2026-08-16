import { describe, expect, it } from "vitest";
import { DraftPlanSchema } from "./schema.ts";

function draft(overrides: Record<string, unknown> = {}) {
  return {
    title: "Measuring what you cannot see",
    throughLine: "An evaluation set too small to resolve a change reports noise as signal.",
    beats: [{ title: "The setup", intent: "Frame the problem", excerptIds: ["doc#a"], weight: 1 }],
    unsupported: [],
    ...overrides,
  };
}

describe("DraftPlanSchema", () => {
  it("accepts a well-formed draft", () => {
    expect(DraftPlanSchema.safeParse(draft()).success).toBe(true);
  });

  it("rejects a whitespace-only title", () => {
    // min(1) alone accepts "   ", which reaches the artifact as a blank title.
    expect(DraftPlanSchema.safeParse(draft({ title: "   " })).success).toBe(false);
  });

  it("trims the values it accepts", () => {
    const parsed = DraftPlanSchema.parse(draft({ title: "  Padded  " }));

    expect(parsed.title).toBe("Padded");
  });

  it("rejects a beat with no citations", () => {
    // An uncited beat is the failure mode this whole stage exists to prevent.
    const beats = [{ title: "t", intent: "i", excerptIds: [], weight: 1 }];

    expect(DraftPlanSchema.safeParse(draft({ beats })).success).toBe(false);
  });

  it("rejects a draft with no beats", () => {
    expect(DraftPlanSchema.safeParse(draft({ beats: [] })).success).toBe(false);
  });

  it("rejects a non-positive weight", () => {
    for (const weight of [0, -1]) {
      const beats = [{ title: "t", intent: "i", excerptIds: ["doc#a"], weight }];
      expect(DraftPlanSchema.safeParse(draft({ beats })).success).toBe(false);
    }
  });

  it("rejects a whitespace-only excerpt id", () => {
    const beats = [{ title: "t", intent: "i", excerptIds: ["  "], weight: 1 }];

    expect(DraftPlanSchema.safeParse(draft({ beats })).success).toBe(false);
  });

  it("requires unsupported to be present, even when empty", () => {
    const { unsupported: _omitted, ...withoutUnsupported } = draft();

    expect(DraftPlanSchema.safeParse(withoutUnsupported).success).toBe(false);
  });
});
