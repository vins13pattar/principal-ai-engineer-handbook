import { describe, expect, it } from "vitest";
import { mcp } from "./mcp.ts";
import { spokenText } from "./speech.ts";
import {
  alignWords,
  captionCues,
  findPhrase,
  tokens,
  toSrt,
  withTiming,
  type TimingManifest,
  type Word,
} from "./timing.ts";
import { sceneSeconds, type Scene } from "./types.ts";

/** Words as a recogniser would report them: every spoken token, 400 ms apart. */
function spoken(scene: Scene): Word[] {
  return tokens(spokenText(scene)).map((text, i) => ({
    text,
    startMs: i * 400,
    endMs: i * 400 + 350,
  }));
}

function cuesOf(scene: Scene): string[] {
  if (scene.kind === "diagram") return scene.steps.flatMap((s) => (s.cue ? [s.cue] : []));
  return scene.beats.flatMap((b) => (b.cue ? [b.cue] : []));
}

describe("findPhrase", () => {
  const words: Word[] = ["the", "load", "balancer", "can", "route", "on", "headers", "alone"].map(
    (text, i) => ({
      text,
      startMs: i * 500,
      endMs: i * 500 + 400,
    }),
  );

  it("returns the start of the matching window", () => {
    expect(findPhrase(words, "route on headers alone")).toBe(2000);
  });

  it("tolerates one recognition miss in a longer phrase", () => {
    expect(findPhrase(words, "can route on header alone")).toBe(1500);
  });

  it("returns null rather than guessing", () => {
    expect(findPhrase(words, "something else entirely")).toBeNull();
  });
});

describe("the module 6 script's cues", () => {
  it("every cue phrase is actually spoken in its own scene", () => {
    for (const scene of mcp.scenes) {
      const words = spoken(scene);
      for (const cue of cuesOf(scene)) {
        expect(findPhrase(words, cue), `${scene.id}: "${cue}"`).not.toBeNull();
      }
    }
  });

  it("moves reveals to the cued word, ahead of it, and reports a phrase it cannot find", () => {
    const scene = mcp.scenes.find((s) => s.id === "roles")!;
    const timing: TimingManifest = { scenes: { roles: { textHash: "x", words: spoken(scene) } } };
    const missed: string[] = [];
    const cued = withTiming(mcp, timing, missed).scenes.find((s) => s.id === "roles")!;
    expect(missed).toEqual([]);
    if (cued.kind !== "diagram") throw new Error("expected a diagram");
    const ats = cued.steps.map((s) => s.at);
    expect(ats).toEqual([...ats].sort((a, b) => a - b));
    expect(ats[1]).not.toBe(0.36);

    const broken: TimingManifest = {
      scenes: { roles: { textHash: "x", words: [{ text: "silence", startMs: 0, endMs: 100 }] } },
    };
    const missed2: string[] = [];
    withTiming(mcp, broken, missed2);
    expect(missed2.length).toBeGreaterThan(0);
  });
});

describe("alignWords", () => {
  it("keeps the written form and borrows times from the words that match", () => {
    const heard: Word[] = [
      { text: "the", startMs: 0, endMs: 200 },
      { text: "M", startMs: 300, endMs: 400 },
      { text: "C", startMs: 400, endMs: 500 },
      { text: "P", startMs: 500, endMs: 600 },
      { text: "protocol", startMs: 700, endMs: 1100 },
    ];
    const out = alignWords("the MCP protocol", heard, 1200);
    expect(out.map((w) => w.text)).toEqual(["the", "MCP", "protocol"]);
    expect(out[0]).toMatchObject({ startMs: 0 });
    expect(out[2]).toMatchObject({ startMs: 700 });
    expect(out[1]!.startMs).toBeGreaterThanOrEqual(200);
    expect(out[1]!.endMs).toBeLessThanOrEqual(700);
  });
});

describe("captions", () => {
  it("breaks at sentence ends and never overlaps the next cue", () => {
    const words =
      "One two three. Four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen."
        .split(" ")
        .map((text, i) => ({ text, startMs: i * 300, endMs: i * 300 + 280 }));
    const cues = captionCues(words);
    expect(cues.length).toBeGreaterThan(1);
    expect(cues[0]!.text).toBe("One two three.");
    for (let i = 1; i < cues.length; i++)
      expect(cues[i]!.startMs).toBeGreaterThan(cues[i - 1]!.endMs);
    for (const cue of cues)
      for (const line of cue.text.split("\n")) expect(line.length).toBeLessThanOrEqual(42);
  });

  it("offsets each scene to where it starts in the cut", () => {
    const first = mcp.scenes[0]!;
    const second = mcp.scenes[1]!;
    const timing: TimingManifest = {
      scenes: {
        [first.id]: { textHash: "x", words: spoken(first) },
        [second.id]: { textHash: "x", words: spoken(second) },
      },
    };
    const srt = toSrt(mcp, timing, () => 30);
    const blocks = srt.trim().split("\n\n");
    expect(blocks[0]).toMatch(/^1\n00:00:00,000 --> /);
    const startOfSecond = Math.round(sceneSeconds(first));
    const stampStart = (b: string) => b.split("\n")[1]!.split(" --> ")[0]!;
    const secondBlock = blocks.find(
      (b) => stampStart(b) >= `00:00:${String(startOfSecond).padStart(2, "0")},000`,
    );
    expect(secondBlock).toBeDefined();
  });
});
