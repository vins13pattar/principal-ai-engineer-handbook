import { describe, expect, it } from "vitest";
import type { PriceList } from "@handbook/podcast-providers";
import { estimatePlanCost } from "./estimate.ts";

const prices: PriceList = {
  inputPerMillionTokens: 3,
  outputPerMillionTokens: 15,
  speechPerMillionCharacters: 100,
};

describe("estimatePlanCost", () => {
  it("prices input from the request and output from the cap", () => {
    const request = { system: "s".repeat(400), prompt: "p".repeat(3600) };

    const breakdown = estimatePlanCost(request, prices, 4000);

    // 4000 characters at four per token is 1000 tokens.
    expect(breakdown.inputTokens).toBe(1000);
    expect(breakdown.inputCost).toBeCloseTo(0.003, 6);
    expect(breakdown.maxOutputTokens).toBe(4000);
    expect(breakdown.maxOutputCost).toBeCloseTo(0.06, 6);
    expect(breakdown.estimatedAtMaxOutput).toBeCloseTo(0.063, 6);
  });

  it("excludes speech entirely, even when speech is priced", () => {
    // `plan` does not synthesise. Pricing synthesis into its total would put
    // dollars on work the command never performs -- visibly wrong the moment a
    // hosted TTS profile is configured, which is why this uses a non-zero
    // speech price rather than the local zero.
    const request = { system: "s".repeat(400), prompt: "p".repeat(3600) };

    const breakdown = estimatePlanCost(request, prices, 4000);

    expect(breakdown.estimatedAtMaxOutput).toBeCloseTo(
      breakdown.inputCost + breakdown.maxOutputCost,
      10,
    );
    expect(Object.keys(breakdown)).not.toContain("speechCost");
  });

  it("counts the system prompt, not only the prompt", () => {
    // The estimator prices the exact request that will be sent. Omitting the
    // system text prices something the model never receives.
    const withSystem = estimatePlanCost({ system: "s".repeat(400), prompt: "p" }, prices, 100);
    const withoutSystem = estimatePlanCost({ system: "", prompt: "p" }, prices, 100);

    expect(withSystem.inputTokens).toBeGreaterThan(withoutSystem.inputTokens);
  });
});
