import { describe, expect, it } from "vitest";
import { estimateCreateCost, estimatePlanCost } from "./estimate.ts";

const prices = {
  inputPerMillionTokens: 3,
  outputPerMillionTokens: 15,
  speechPerMillionCharacters: 0,
};

const request = { system: "x".repeat(400), prompt: "y".repeat(98_000) };

describe("estimatePlanCost", () => {
  it("prices one call at its ceiling, which for one call is a real bound", () => {
    const cost = estimatePlanCost(request, prices, 16_000);

    expect(cost.inputTokens).toBe(24_600);
    expect(cost.estimatedAtMaxOutput).toBeCloseTo(cost.inputCost + cost.maxOutputCost, 10);
  });
});

describe("estimateCreateCost", () => {
  const options = { beats: 5, characterBudget: 4300, review: true };

  it("counts every call the pipeline will make", () => {
    const cost = estimateCreateCost(request, prices, options);

    expect(cost.calls).toBe(11);
    expect(estimateCreateCost(request, prices, { ...options, review: false }).calls).toBe(6);
  });

  it("sends the pack to each stage", () => {
    // Planner, then dialogue beat by beat, then review over the same material.
    const withReview = estimateCreateCost(request, prices, options);
    const without = estimateCreateCost(request, prices, { ...options, review: false });

    expect(withReview.inputTokens).toBe(24_600 * 3);
    expect(without.inputTokens).toBe(24_600 * 2);
  });

  it("lands near what real runs actually cost", () => {
    // The point of the change. Two measured runs at this budget cost $0.4188
    // and $0.4590; the ceiling this replaced quoted $0.93.
    const cost = estimateCreateCost(request, prices, options);

    expect(cost.expected).toBeGreaterThan(0.38);
    expect(cost.expected).toBeLessThan(0.5);
  });

  it("lands near a real run with review off", () => {
    // Measured: $0.2073 and $0.2079.
    const cost = estimateCreateCost(request, prices, { ...options, review: false });

    expect(cost.expected).toBeGreaterThan(0.17);
    expect(cost.expected).toBeLessThan(0.25);
  });

  it("prices review as a large addition, not a rounding error", () => {
    // Revision returns a whole rewritten beat whenever review finds anything,
    // and it found something in nine of ten beats across two documents. The
    // first attempt at this modelled review as a short list and predicted a
    // quarter of the real cost.
    const withReview = estimateCreateCost(request, prices, options);
    const without = estimateCreateCost(request, prices, { ...options, review: false });

    expect(withReview.expectedOutputTokens / without.expectedOutputTokens).toBeGreaterThan(3);
  });

  it("scales with the duration's character budget", () => {
    const short = estimateCreateCost(request, prices, { ...options, characterBudget: 2000 });
    const long = estimateCreateCost(request, prices, { ...options, characterBudget: 8000 });

    expect(long.expectedOutputTokens).toBeGreaterThan(short.expectedOutputTokens * 3);
  });
});
