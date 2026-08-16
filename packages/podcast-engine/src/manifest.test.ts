import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ManifestSchema, writeManifest } from "./manifest.ts";

function common() {
  return {
    manifestVersion: 1,
    command: "plan",
    documentId: "module:06-mcp",
    runId: "2026-08-16T13-42-07Z-a3f9c1",
    startedAt: "2026-08-16T13:42:07.000Z",
    finishedAt: "2026-08-16T13:42:19.000Z",
    request: { durationSeconds: 2400 },
    artifacts: ["plan.json", "manifest.json"],
  };
}

function completeManifest(overrides: Record<string, unknown> = {}) {
  return {
    ...common(),
    status: "complete",
    source: { sourceHash: "abc", excerptCount: 24, droppedForBudget: [] },
    model: { modelId: "claude-x" },
    usage: { inputTokens: 100, outputTokens: 20, speechCharacters: 0 },
    cost: { estimatedAtMaxOutput: 0.115, measured: 0.06 },
    ...overrides,
  };
}

describe("ManifestSchema", () => {
  it("accepts a complete manifest", () => {
    expect(ManifestSchema.safeParse(completeManifest()).success).toBe(true);
  });

  it("rejects a complete manifest carrying a failure", () => {
    // The state that must be unrepresentable: the one file whose job is to say
    // which happened, saying both.
    const manifest = completeManifest({ failure: { stage: "plan", message: "x" } });

    expect(ManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("rejects a failed manifest with no failure", () => {
    const manifest = { ...common(), status: "failed" };

    expect(ManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("accepts a failed manifest missing source, model, usage and cost", () => {
    // A run can die before any of them exists -- an unknown document id
    // reaches no model, and a schema failure may carry no usage.
    const manifest = {
      ...common(),
      status: "failed",
      failure: { stage: "plan", message: "the model did not return a value matching the schema" },
    };

    expect(ManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("rejects a complete manifest missing what a finished run must have", () => {
    const manifest = completeManifest();
    delete (manifest as Record<string, unknown>)["usage"];

    expect(ManifestSchema.safeParse(manifest).success).toBe(false);
  });
});

describe("writeManifest", () => {
  let directory = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "podcast-manifest-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("writes a valid manifest", async () => {
    await writeManifest(directory, completeManifest());

    const written = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
    expect(written.status).toBe("complete");
  });

  it("refuses to write an invalid manifest", async () => {
    // A malformed manifest is indistinguishable from a missing one to anything
    // reading it, and a run with no manifest is a run whose status is unknown.
    await expect(writeManifest(directory, { ...common(), status: "failed" })).rejects.toThrow();

    await expect(readFile(join(directory, "manifest.json"), "utf8")).rejects.toThrow();
  });
});
