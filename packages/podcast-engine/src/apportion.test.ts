import { describe, expect, it } from "vitest";
import type { SourceExcerpt } from "@handbook/content";
import { allocateCharacters, apportion } from "./apportion.ts";
import type { PlanBudget } from "./budget.ts";
import type { DraftPlan } from "./schema.ts";

function excerpt(documentId: string, heading: string, characters: number): SourceExcerpt {
  return {
    documentId,
    url: `/${documentId}/`,
    title: documentId,
    heading,
    body: "x".repeat(characters),
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

function draft(beats: DraftPlan["beats"]): DraftPlan {
  return { title: "T", throughLine: "L", beats, unsupported: [] };
}

describe("allocateCharacters", () => {
  it("splits weight-proportionally", () => {
    expect(allocateCharacters(100, [9, 1])).toEqual([90, 10]);
    expect(allocateCharacters(10, [1, 1])).toEqual([5, 5]);
  });

  it("conserves the exact character count", () => {
    // Every allocation sums to what was handed in -- no multiplication, no loss.
    for (const [characters, weights] of [
      [1, [9, 1]],
      [7, [1, 1, 1]],
      [1000, [3, 5, 7, 11]],
      [3, [1, 1, 1, 1, 1]],
    ] as Array<[number, number[]]>) {
      const allocated = allocateCharacters(characters, weights);

      expect(allocated.reduce((sum, value) => sum + value, 0)).toBe(characters);
      expect(allocated).toHaveLength(weights.length);
    }
  });

  it("gives the remainder to the largest fraction, ties to the earlier beat", () => {
    // Draft order is the tie-break, so allocation is deterministic.
    expect(allocateCharacters(1, [1, 1])).toEqual([1, 0]);
    expect(allocateCharacters(1, [9, 1])).toEqual([1, 0]);
  });

  it("never allocates a negative or fractional share", () => {
    const allocated = allocateCharacters(5, [1, 2, 97]);

    for (const value of allocated) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("apportion", () => {
  it("scales weights into seconds when the source supports it", () => {
    const excerpts = [excerpt("doc", "A", 1000), excerpt("doc", "B", 1000)];
    const ids = ["doc#a", "doc#b"];
    const result = apportion(
      draft([
        { title: "One", intent: "i", excerptIds: ["doc#a"], weight: 3 },
        { title: "Two", intent: "i", excerptIds: ["doc#b"], weight: 1 },
      ]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.beats[0]!.targetSeconds).toBeCloseTo(75, 5);
    expect(result.beats[1]!.targetSeconds).toBeCloseTo(25, 5);
    expect(result.plannedSeconds).toBeCloseTo(100, 5);
    expect(result.shortfall).toBeNull();
  });

  it("clips a beat to what its citations support, and names it", () => {
    // Beat Two wants 10s but its excerpt sustains 5.
    const excerpts = [excerpt("doc", "A", 95), excerpt("doc", "B", 5)];
    const ids = ["doc#a", "doc#b"];
    const result = apportion(
      draft([
        { title: "One", intent: "i", excerptIds: ["doc#a"], weight: 9 },
        { title: "Two", intent: "i", excerptIds: ["doc#b"], weight: 1 },
      ]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.beats[1]!.targetSeconds).toBeCloseTo(5, 5);
    expect(result.plannedSeconds).toBeCloseTo(95, 5);
    expect(result.shortfall).not.toBeNull();
    expect(result.shortfall!.thinBeats).toEqual(["Two"]);
    expect(result.shortfall!.seconds).toBeCloseTo(5, 5);
  });

  it("does not let duplicate citations inside one beat buy duration", () => {
    const excerpts = [excerpt("doc", "A", 50)];
    const ids = ["doc#a"];
    const once = apportion(
      draft([{ title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 }]),
      excerpts,
      ids,
      budget(),
    );
    const twice = apportion(
      draft([{ title: "One", intent: "i", excerptIds: ["doc#a", "doc#a"], weight: 1 }]),
      excerpts,
      ids,
      budget(),
    );

    expect(twice.beats[0]!.allocatedCharacters).toBe(once.beats[0]!.allocatedCharacters);
    expect(twice.plannedSeconds).toBeCloseTo(once.plannedSeconds, 10);
  });

  it("shares an excerpt cited by several beats rather than duplicating it", () => {
    // Total allocated never exceeds the union of cited excerpts.
    const excerpts = [excerpt("doc", "A", 100)];
    const ids = ["doc#a"];
    const result = apportion(
      draft([
        { title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 },
        { title: "Two", intent: "i", excerptIds: ["doc#a"], weight: 1 },
      ]),
      excerpts,
      ids,
      budget(),
    );

    const allocated = result.beats.reduce((sum, beat) => sum + beat.allocatedCharacters, 0);
    expect(allocated).toBe(100);
  });

  it("never plans past the request or past the evidence", () => {
    const excerpts = [excerpt("doc", "A", 40), excerpt("doc", "B", 20)];
    const ids = ["doc#a", "doc#b"];
    const result = apportion(
      draft([
        { title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 },
        { title: "Two", intent: "i", excerptIds: ["doc#b"], weight: 1 },
      ]),
      excerpts,
      ids,
      budget({ requestedSeconds: 1000 }),
    );

    const capacity = (1 * 60) / 1; // expansionFactor x unionChars / charsPerSecond
    expect(result.plannedSeconds).toBeLessThanOrEqual(1000);
    expect(result.plannedSeconds).toBeLessThanOrEqual(capacity);
  });

  it("does not flag a beat as thin on floating-point residue alone", () => {
    // Weights 8/7/2 against requestedSeconds: 100 sum in floating point to
    // 100.00000000000001, not 100. With abundant characters -- no beat is
    // actually ceiling-bound -- a raw `supportable < desired` comparison
    // would flag a beat as thin purely on that ~1e-14 residue, flipping
    // `shortfall` to non-null and naming a beat that was never clipped. It
    // would also violate the schema invariant that `thinBeats` is never
    // empty when `shortfall` is non-null.
    const excerpts = [
      excerpt("doc", "A", 1000),
      excerpt("doc", "B", 1000),
      excerpt("doc", "C", 1000),
    ];
    const ids = ["doc#a", "doc#b", "doc#c"];
    const result = apportion(
      draft([
        { title: "One", intent: "i", excerptIds: ["doc#a"], weight: 8 },
        { title: "Two", intent: "i", excerptIds: ["doc#b"], weight: 7 },
        { title: "Three", intent: "i", excerptIds: ["doc#c"], weight: 2 },
      ]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.shortfall).toBeNull();
  });

  it("clamps plannedSeconds to requestedSeconds despite float overshoot", () => {
    // Same 8/7/2 weights: summing the per-beat targetSeconds in floating
    // point overshoots requestedSeconds by ~1e-14 even though no beat is
    // ceiling-bound. plannedSeconds must not silently exceed what was asked
    // for.
    const excerpts = [
      excerpt("doc", "A", 1000),
      excerpt("doc", "B", 1000),
      excerpt("doc", "C", 1000),
    ];
    const ids = ["doc#a", "doc#b", "doc#c"];
    const result = apportion(
      draft([
        { title: "One", intent: "i", excerptIds: ["doc#a"], weight: 8 },
        { title: "Two", intent: "i", excerptIds: ["doc#b"], weight: 7 },
        { title: "Three", intent: "i", excerptIds: ["doc#c"], weight: 2 },
      ]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.plannedSeconds).toBeLessThanOrEqual(100);
    expect(result.plannedSeconds).toBe(100);
  });

  it("allocates nothing from an excerpt no beat cites", () => {
    // Capacity is the union of *cited* excerpts. An uncited excerpt sitting in
    // the pack must not quietly raise plannedSeconds -- the beat is bound by
    // what it drew on, not by what was available.
    const excerpts = [excerpt("doc", "A", 50), excerpt("doc", "B", 1000)];
    const ids = ["doc#a", "doc#b"];
    const result = apportion(
      draft([{ title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 }]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.beats[0]!.allocatedCharacters).toBe(50);
    expect(result.plannedSeconds).toBeCloseTo(50, 5);
    expect(result.shortfall!.thinBeats).toEqual(["One"]);
  });

  it("keeps a zero-allocation beat rather than dropping or flooring it", () => {
    // A single character shared 9:1 allocates 1 and 0.
    const excerpts = [excerpt("doc", "A", 1)];
    const ids = ["doc#a"];
    const result = apportion(
      draft([
        { title: "Heavy", intent: "i", excerptIds: ["doc#a"], weight: 9 },
        { title: "Light", intent: "i", excerptIds: ["doc#a"], weight: 1 },
      ]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.beats).toHaveLength(2);
    expect(result.beats[1]!.allocatedCharacters).toBe(0);
    expect(result.beats[1]!.targetSeconds).toBe(0);
    expect(result.shortfall!.thinBeats).toContain("Light");
  });

  it("throws when every beat allocates zero", () => {
    // plannedSeconds of 0 cannot become an episode; the only honest reading is
    // that nothing is sourceable.
    const excerpts = [excerpt("doc", "A", 0)];
    const ids = ["doc#a"];

    expect(() =>
      apportion(
        draft([{ title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 }]),
        excerpts,
        ids,
        budget(),
      ),
    ).toThrow(/no beat has any supporting text/);
  });

  it("reports a non-negative shortfall", () => {
    const excerpts = [excerpt("doc", "A", 1000)];
    const ids = ["doc#a"];
    const result = apportion(
      draft([{ title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 }]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.shortfall?.seconds ?? 0).toBeGreaterThanOrEqual(0);
  });
});
