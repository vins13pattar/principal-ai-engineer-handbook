import { describe, expect, it } from "vitest";
import { assertPlanBudget, assertWithinBudget, deriveSegmentBudget } from "./budget.ts";
import type { PlanBudget } from "./budget.ts";
import type { EpisodePlan } from "./schema.ts";

/** Measured on an M4 in commit 66face3. */
const COST = { fixedSeconds: 3.16, marginalRtf: 0.073 };

function budget(overrides: Partial<PlanBudget> = {}): PlanBudget {
  return {
    requestedSeconds: 2400,
    expansionFactor: 3,
    charsPerSecond: 16.2,
    maxRenderSeconds: 300,
    synthesisCost: COST,
    ...overrides,
  };
}

describe("assertPlanBudget", () => {
  it("accepts a well-formed budget", () => {
    expect(() => assertPlanBudget(budget())).not.toThrow();
  });

  it("rejects a non-positive request, expansion, speech rate or ceiling", () => {
    expect(() => assertPlanBudget(budget({ requestedSeconds: 0 }))).toThrow(/requestedSeconds/);
    expect(() => assertPlanBudget(budget({ expansionFactor: 0 }))).toThrow(/expansionFactor/);
    expect(() => assertPlanBudget(budget({ charsPerSecond: 0 }))).toThrow(/charsPerSecond/);
    expect(() => assertPlanBudget(budget({ maxRenderSeconds: 0 }))).toThrow(/maxRenderSeconds/);
  });

  it("rejects a zero fixed cost, which is the divisor in maxSegments", () => {
    // Left unchecked this yields Infinity segments rather than an error.
    expect(() =>
      assertPlanBudget(budget({ synthesisCost: { fixedSeconds: 0, marginalRtf: 0.073 } })),
    ).toThrow(/fixedSeconds/);
  });

  it("accepts a zero marginal RTF, the one legitimate zero", () => {
    expect(() =>
      assertPlanBudget(budget({ synthesisCost: { fixedSeconds: 3.16, marginalRtf: 0 } })),
    ).not.toThrow();
  });

  it("rejects a negative marginal RTF", () => {
    expect(() =>
      assertPlanBudget(budget({ synthesisCost: { fixedSeconds: 3.16, marginalRtf: -0.1 } })),
    ).toThrow(/marginalRtf/);
  });

  it("rejects non-finite values", () => {
    expect(() => assertPlanBudget(budget({ requestedSeconds: Number.NaN }))).toThrow(/finite/);
    expect(() => assertPlanBudget(budget({ charsPerSecond: Infinity }))).toThrow(/finite/);
  });
});

describe("deriveSegmentBudget", () => {
  it("solves the ceiling for the measured cost", () => {
    // 39 x 3.16 + 0.073 x 2400 = 298.4s; 40 would need 301.6s.
    const solved = deriveSegmentBudget(COST, 2400, 300);

    expect(solved.maxSegments).toBe(39);
    expect(solved.projectedSeconds).toBeCloseTo(298.4, 1);
    expect(solved.ceilingSeconds).toBe(300);
  });

  it("allows more segments on a shorter episode under the same ceiling", () => {
    // Less audio to synthesise leaves more room for per-call overhead.
    const solved = deriveSegmentBudget(COST, 1780, 300);

    expect(solved.maxSegments).toBe(53);
    expect(solved.projectedSeconds).toBeCloseTo(297.4, 1);
  });

  it("stays under the ceiling and would exceed it at one more segment", () => {
    for (const plannedSeconds of [600, 1780, 2400, 3600]) {
      const solved = deriveSegmentBudget(COST, plannedSeconds, 300);

      expect(solved.projectedSeconds).toBeLessThanOrEqual(solved.ceilingSeconds);
      expect(solved.projectedSeconds + COST.fixedSeconds).toBeGreaterThan(solved.ceilingSeconds);
    }
  });

  it("throws when the ceiling is unreachable even as a single call", () => {
    expect(() => deriveSegmentBudget(COST, 2400, 100)).toThrow(/unreachable/);
    expect(() => deriveSegmentBudget(COST, 2400, 100)).toThrow(/178\.4|100/);
  });
});

describe("assertWithinBudget", () => {
  const plan = {
    segmentBudget: { maxSegments: 39, ceilingSeconds: 300, projectedSeconds: 298.4, basis: COST },
  } as EpisodePlan;

  it("accepts a count at the budget", () => {
    expect(() => assertWithinBudget(plan, 39)).not.toThrow();
    expect(() => assertWithinBudget(plan, 1)).not.toThrow();
  });

  it("rejects one past the budget, naming both numbers", () => {
    expect(() => assertWithinBudget(plan, 40)).toThrow(/40/);
    expect(() => assertWithinBudget(plan, 40)).toThrow(/39/);
  });

  it("rejects a non-positive count", () => {
    expect(() => assertWithinBudget(plan, 0)).toThrow(/at least one/);
  });
});
