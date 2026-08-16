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

  it("sums the shares of every excerpt a single beat cites", () => {
    // One beat citing two distinct excerpts must accumulate both shares, not
    // land on whichever excerpt is processed last.
    const excerpts = [excerpt("doc", "A", 300), excerpt("doc", "B", 700)];
    const ids = ["doc#a", "doc#b"];
    const result = apportion(
      draft([{ title: "One", intent: "i", excerptIds: ["doc#a", "doc#b"], weight: 1 }]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.beats[0]!.allocatedCharacters).toBe(1000);
    expect(result.beats[0]!.excerptIds).toEqual(["doc#a", "doc#b"]);
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
    // 100.00000000000001, not 100. This pins the *structural* shortfall
    // decision: `shortfall` is null because no beat was clipped, not because
    // `plannedSeconds === requestedSeconds`. Deciding it by that equality
    // would emit `shortfall: { seconds: 0, thinBeats: [] }` here, violating
    // the schema invariant that `thinBeats` is never empty when `shortfall`
    // is non-null.
    //
    // It does NOT discriminate the epsilon in `apportion`: with 1000
    // characters a beat, `supportable` is ~1000s against a `desired` of ~47s,
    // so a raw `supportable < desired` passes this test too. The capacity
    // boundary that does discriminate it has its own test above.
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

  it("does not flag a beat sitting exactly at its capacity as thin", () => {
    // This is the case the epsilon in `apportion` exists for, and the only
    // one that discriminates it. The test above uses abundant characters, so
    // `supportable` (~1000s) is nowhere near `desired` (~47s) and a raw
    // `supportable < desired` passes it just as happily.
    //
    // Here `requestedSeconds` is set to exactly the capacity the source
    // sustains, so `desired` and `supportable` are mathematically equal and
    // differ only by float residue from two unrelated computation paths.
    // Beat "Two" lands at desired 89.04 against supportable 89.03999999999999
    // -- a gap of 1.4e-14 -- and a raw `<` reports it as clipped, flipping
    // `shortfall` to non-null and naming a beat nothing actually clipped.
    const characters = 2226;
    const expansionFactor = 1.4;
    const charsPerSecond = 17.5;
    const capacity = (expansionFactor * characters) / charsPerSecond;

    const result = apportion(
      draft([
        { title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 },
        { title: "Two", intent: "i", excerptIds: ["doc#a"], weight: 3 },
        { title: "Three", intent: "i", excerptIds: ["doc#a"], weight: 2 },
      ]),
      [excerpt("doc", "A", characters)],
      ["doc#a"],
      budget({ requestedSeconds: capacity, expansionFactor, charsPerSecond }),
    );

    expect(result.shortfall).toBeNull();
    expect(result.plannedSeconds).toBeCloseTo(capacity, 9);
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

  it("reports shortfall.seconds as requestedSeconds minus plannedSeconds", () => {
    // A genuinely thin case, not the earlier vacuous one: the excerpt sustains
    // 20s against a 100s request, so shortfall.seconds must equal the gap.
    const excerpts = [excerpt("doc", "A", 20)];
    const ids = ["doc#a"];
    const result = apportion(
      draft([{ title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 }]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.shortfall).not.toBeNull();
    expect(result.shortfall!.seconds).toBeCloseTo(
      budget().requestedSeconds - result.plannedSeconds,
      10,
    );
  });

  it("throws when excerpts and excerptIds have different lengths", () => {
    const excerpts = [excerpt("doc", "A", 100)];
    const ids = ["doc#a", "doc#b"];

    expect(() =>
      apportion(
        draft([{ title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 }]),
        excerpts,
        ids,
        budget(),
      ),
    ).toThrow(/excerpts and excerptIds must be the same length.*1 excerpts.*2 excerptIds/s);
  });
});
