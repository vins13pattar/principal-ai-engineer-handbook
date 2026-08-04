import { describe, expect, it } from "vitest";
import { adrDocSchema, learnModuleSchema, revisionHistoryEntrySchema } from "./schemas.ts";

describe("revisionHistoryEntrySchema", () => {
  it("accepts a well-formed entry", () => {
    const result = revisionHistoryEntrySchema.safeParse({
      version: "0.1.0",
      date: "2026-01-15",
      change: "Initial publication",
      author: "vinod",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-semver version", () => {
    const result = revisionHistoryEntrySchema.safeParse({
      version: "v1",
      date: "2026-01-15",
      change: "Initial publication",
    });
    expect(result.success).toBe(false);
  });
});

describe("learnModuleSchema", () => {
  const base = {
    title: "Production Python",
    description: "Production-grade Python for AI infrastructure engineers.",
    version: "0.2.0",
    lastUpdated: "2026-07-01",
    revisionHistory: [{ version: "0.1.0", date: "2026-01-01", change: "Initial draft" }],
    moduleNumber: 1,
    difficulty: "intermediate",
    estimatedMinutes: 45,
  };

  it("accepts a valid module and applies defaults", () => {
    const result = learnModuleSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prerequisites).toEqual([]);
      expect(result.data.draft).toBe(false);
    }
  });

  it("rejects an invalid difficulty level", () => {
    const result = learnModuleSchema.safeParse({ ...base, difficulty: "guru" });
    expect(result.success).toBe(false);
  });

  it("requires at least one revision history entry", () => {
    const result = learnModuleSchema.safeParse({ ...base, revisionHistory: [] });
    expect(result.success).toBe(false);
  });
});

describe("adrDocSchema", () => {
  const base = {
    title: "Use Redis for distributed rate limiting",
    description: "ADR covering the gateway's quota backend.",
    version: "1.0.0",
    lastUpdated: "2026-05-01",
    revisionHistory: [{ version: "1.0.0", date: "2026-05-01", change: "Accepted" }],
    adrNumber: 1,
    status: "accepted",
  };

  it("accepts a valid ADR", () => {
    expect(adrDocSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(adrDocSchema.safeParse({ ...base, status: "maybe" }).success).toBe(false);
  });
});
