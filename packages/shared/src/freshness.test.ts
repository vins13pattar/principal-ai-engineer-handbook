import { describe, expect, it } from "vitest";
import { getFreshnessStatus } from "./freshness.ts";

describe("getFreshnessStatus", () => {
  const now = new Date("2026-08-04T00:00:00Z");

  it("classifies recently updated pages as fresh", () => {
    expect(getFreshnessStatus(new Date("2026-06-01T00:00:00Z"), now)).toBe("fresh");
  });

  it("classifies pages between 6 and 12 months old as aging", () => {
    expect(getFreshnessStatus(new Date("2026-01-01T00:00:00Z"), now)).toBe("aging");
  });

  it("classifies pages older than 12 months as stale", () => {
    expect(getFreshnessStatus(new Date("2024-01-01T00:00:00Z"), now)).toBe("stale");
  });

  it("respects custom thresholds", () => {
    const lastUpdated = new Date("2026-07-01T00:00:00Z");
    expect(
      getFreshnessStatus(lastUpdated, now, { agingAfterMonths: 0.5, staleAfterMonths: 1 }),
    ).toBe("stale");
  });
});
