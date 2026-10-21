import { describe, expect, it } from "vitest";
import { EMPTY_AUDIO, withAudio } from "./audio.ts";
import { mcp } from "./06-mcp.ts";
import { spokenText, textHash } from "./speech.ts";
import { sceneSeconds } from "./types.ts";

const [first] = mcp.scenes;

describe("spokenText", () => {
  it("spells out terms a speech model misreads, without touching the written narration", () => {
    const scene = mcp.scenes.find((s) => s.id === "anatomy")!;
    const spoken = spokenText(scene);
    expect(spoken).toContain("M C P method");
    expect(spoken).toContain("underscore meta");
    expect(spoken).not.toContain("Mcp-Method");
    expect(scene.narration).toContain("Mcp-Method");
  });

  it("does not let the short acronym rule swallow the longer header name", () => {
    const scene = mcp.scenes.find((s) => s.id === "failures")!;
    expect(spokenText(scene)).toContain("M C P method and M C P name");
  });
});

describe("withAudio", () => {
  it("leaves unspoken scenes on their word-count estimate", () => {
    const script = withAudio(mcp, EMPTY_AUDIO);
    expect(script.scenes.every((s) => s.audioSeconds === undefined)).toBe(true);
  });

  it("uses the measured length, plus the pad, once a scene has audio", () => {
    const manifest = {
      ...EMPTY_AUDIO,
      scenes: {
        [first!.id]: {
          textHash: textHash(first!),
          audio: "narration/06-mcp/problem.wav",
          audioSeconds: 40,
        },
      },
    };
    const scene = withAudio(mcp, manifest).scenes[0]!;
    expect(scene.audio).toBe("narration/06-mcp/problem.wav");
    expect(sceneSeconds(scene)).toBeCloseTo(40.9, 5);
  });

  it("refuses audio recorded for text that has since changed", () => {
    const manifest = {
      ...EMPTY_AUDIO,
      scenes: { [first!.id]: { textHash: "stale", audio: "x.wav", audioSeconds: 40 } },
    };
    expect(() => withAudio(mcp, manifest)).toThrow(/stale/);
  });
});
