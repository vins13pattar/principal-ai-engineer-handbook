import { describe, expect, it } from "vitest";
import { DEFAULT_REVIEW_AFTER_DAYS, getFreshnessStatus, getReviewStatus } from "./freshness.ts";

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

describe("getReviewStatus", () => {
  const now = new Date("2026-08-08T00:00:00Z");

  it("reports a recently verified fast-moving page as not overdue", () => {
    const status = getReviewStatus(
      { classification: "fast-moving", verifiedOn: new Date("2026-07-28T00:00:00Z") },
      now,
    );
    expect(status.overdue).toBe(false);
    expect(status.reviewAfterDays).toBe(DEFAULT_REVIEW_AFTER_DAYS["fast-moving"]);
  });

  it("reports a fast-moving page past its window as overdue", () => {
    const status = getReviewStatus(
      { classification: "fast-moving", verifiedOn: new Date("2026-01-01T00:00:00Z") },
      now,
    );
    expect(status.overdue).toBe(true);
    expect(status.daysRemaining).toBeLessThan(0);
  });

  it("holds a stable page to a much longer window than a fast-moving one", () => {
    const verifiedOn = new Date("2026-01-01T00:00:00Z");
    expect(getReviewStatus({ classification: "stable", verifiedOn }, now).overdue).toBe(false);
    expect(getReviewStatus({ classification: "fast-moving", verifiedOn }, now).overdue).toBe(true);
  });

  it("lets a per-page override tighten the window below its classification default", () => {
    const status = getReviewStatus(
      {
        classification: "stable",
        verifiedOn: new Date("2026-06-01T00:00:00Z"),
        reviewAfterDays: 30,
      },
      now,
    );
    expect(status.reviewAfterDays).toBe(30);
    expect(status.overdue).toBe(true);
  });

  it("does not report a page as overdue when it was never verified", () => {
    // The linter reports a missing declaration separately; flagging it here too
    // would double-report one problem as two.
    const status = getReviewStatus({ classification: "fast-moving" }, now);
    expect(status.overdue).toBe(false);
  });
});
