import { describe, expect, it } from "vitest";
import { trimToBudget } from "./trim.ts";
import type { DialogueScript } from "./dialogue.ts";
import type { EpisodePlan } from "./schema.ts";

function plan(beatSeconds: number[]): EpisodePlan {
  return {
    topic: "Evaluation",
    title: "Title",
    throughLine: "Through-line.",
    beats: beatSeconds.map((targetSeconds, index) => ({
      title: `Beat ${index + 1}`,
      intent: "intent",
      excerptIds: ["doc#alpha"],
      weight: 1,
      targetSeconds,
      allocatedCharacters: 1000,
    })),
    requestedSeconds: beatSeconds.reduce((total, seconds) => total + seconds, 0),
    plannedSeconds: beatSeconds.reduce((total, seconds) => total + seconds, 0),
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
  };
}

/** `n` turns of `size` characters, all tagged to `beat`. */
function turns(beat: number, count: number, size: number, from = "a"): DialogueScript["turns"] {
  return Array.from({ length: count }, (_, index) => ({
    speaker: index % 2 === 0 ? ("host" as const) : ("guest" as const),
    beat,
    text: from.repeat(size),
  }));
}

describe("trimToBudget", () => {
  it("leaves a script that already fits completely alone", () => {
    // 2 turns of 100 against a 60s beat at 14 chars/s = 840 characters.
    const script: DialogueScript = { turns: turns(1, 2, 100) };

    const result = trimToBudget(script, plan([60]), 14);

    expect(result.dropped).toEqual([]);
    expect(result.script.turns).toHaveLength(2);
    expect(result.charactersAfter).toBe(result.charactersBefore);
  });

  it("cuts a script back to its budget", () => {
    // 10 turns of 300 = 3000 characters against 840.
    const script: DialogueScript = { turns: turns(1, 10, 300) };

    const result = trimToBudget(script, plan([60]), 14);

    expect(result.charactersBefore).toBe(3000);
    expect(result.charactersAfter).toBeLessThanOrEqual(840);
    expect(result.dropped).toHaveLength(10 - result.script.turns.length);
  });

  it("takes the padding out of every beat rather than the ending off the episode", () => {
    // The close is the last thing written and the first thing a flat trim
    // drops. Each beat here is over budget; all three must survive.
    const script: DialogueScript = {
      turns: [...turns(1, 5, 300), ...turns(2, 5, 300), ...turns(3, 5, 300)],
    };

    const result = trimToBudget(script, plan([60, 60, 60]), 14);

    const survivingBeats = new Set(result.script.turns.map((turn) => turn.beat));
    expect(survivingBeats).toEqual(new Set([1, 2, 3]));
  });

  it("keeps a beat's first turn even when that turn alone busts the budget", () => {
    // A beat trimmed to nothing is a beat the planner asked for that the
    // episode never covers -- worse than one that runs long.
    const script: DialogueScript = { turns: turns(1, 1, 5000) };

    const result = trimToBudget(script, plan([60]), 14);

    expect(result.script.turns).toHaveLength(1);
    expect(result.dropped).toEqual([]);
  });

  it("reports dropped turns by their index in the original script", () => {
    const script: DialogueScript = { turns: turns(1, 4, 500) };

    const result = trimToBudget(script, plan([60]), 14);

    // 500 fits (first turn always kept), 1000 would exceed 840, so 1..3 go.
    expect(result.dropped).toEqual([1, 2, 3]);
  });

  it("keeps turns in their original order", () => {
    const script: DialogueScript = {
      turns: [...turns(1, 2, 100, "a"), ...turns(2, 2, 100, "b")],
    };

    const result = trimToBudget(script, plan([60, 60]), 14);

    expect(result.script.turns.map((turn) => turn.beat)).toEqual([1, 1, 2, 2]);
  });

  it("keeps a turn tagged to a beat the plan does not have", () => {
    // A `beat: 9` on a two-beat plan is a labelling mistake, not a reason to
    // throw away dialogue. It is clamped into range instead.
    const script: DialogueScript = { turns: [...turns(1, 1, 100), ...turns(9, 1, 100)] };

    const result = trimToBudget(script, plan([60, 60]), 14);

    expect(result.script.turns).toHaveLength(2);
    expect(result.dropped).toEqual([]);
  });

  it("survives a beat that got no turns at all", () => {
    const script: DialogueScript = { turns: turns(1, 2, 100) };

    const result = trimToBudget(script, plan([60, 60]), 14);

    expect(result.script.turns).toHaveLength(2);
  });

  it("does not let a mis-tagged script decide the episode's length", () => {
    // Every turn tagged to beat 1 on a five-beat plan is a labelling mistake.
    // Charging it beat 1's share alone would cut a five-minute episode to
    // sixty seconds: the tags would be deciding length rather than placement.
    const script: DialogueScript = { turns: turns(1, 40, 300) };
    const fiveBeats = plan([60, 60, 60, 60, 60]);

    const result = trimToBudget(script, fiveBeats, 14);

    // The whole 300s budget is available to the one beat that has turns.
    expect(result.charactersAfter).toBeGreaterThan(4000);
    expect(result.charactersAfter).toBeLessThanOrEqual(300 * 14);
  });

  it("lands near the budget rather than well under it", () => {
    // The real regression this guards: cuts fall on turn boundaries, so every
    // beat that stops short leaves most of a turn unspent. Without carrying
    // that remainder forward, five beats threw away roughly a turn each and a
    // 300-second episode came out at 207.
    //
    // 5 beats x 60s at 14 chars/s is a 4200-character budget; the script is
    // 4800 in turns of 320, which is over by about one turn per beat.
    const script: DialogueScript = {
      turns: [1, 2, 3, 4, 5].flatMap((beat) => turns(beat, 3, 320)),
    };

    const result = trimToBudget(script, plan([60, 60, 60, 60, 60]), 14);

    expect(result.charactersAfter).toBeLessThanOrEqual(4200);
    // Within one turn of the budget, rather than within five.
    expect(result.charactersAfter).toBeGreaterThan(4200 - 320);
  });

  it("never renders more than the episode's total budget", () => {
    // The property that makes this a guarantee rather than a request: whatever
    // the model wrote and however it tagged it, this holds.
    for (const tags of [1, 2, 3]) {
      const script: DialogueScript = {
        turns: [...turns(tags, 20, 400), ...turns(1, 20, 400)],
      };

      const result = trimToBudget(script, plan([60, 60, 60]), 14);

      // Each beat keeps its first turn unconditionally, so the bound is the
      // budget plus at most one oversized opening per beat.
      expect(result.charactersAfter).toBeLessThanOrEqual(180 * 14 + 3 * 400);
    }
  });
});
