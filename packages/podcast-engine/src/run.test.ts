import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeRunId, reserveRunDirectory, sanitiseSegment } from "./run.ts";

describe("sanitiseSegment", () => {
  it("replaces characters that are unsafe in a path", () => {
    expect(sanitiseSegment("module:06-mcp")).toBe("module-06-mcp");
    expect(sanitiseSegment("lab/semantic-cache")).toBe("lab-semantic-cache");
    expect(sanitiseSegment("a\\b")).toBe("a-b");
  });

  it("collapses and trims separators", () => {
    expect(sanitiseSegment("a:::b")).toBe("a-b");
    expect(sanitiseSegment(":lead-and-trail:")).toBe("lead-and-trail");
  });

  it("rejects rather than repairs a traversing or empty result", () => {
    // "." and ".." survive the replacement unchanged and are exactly the two
    // names that traverse rather than nest. Repairing them would invent a
    // directory name the operator never asked for.
    expect(() => sanitiseSegment("...")).toThrow();
    expect(() => sanitiseSegment(".")).toThrow();
    expect(() => sanitiseSegment("..")).toThrow();
    expect(() => sanitiseSegment("")).toThrow();
    expect(() => sanitiseSegment(":::")).toThrow();
  });
});

describe("makeRunId", () => {
  it("is filesystem-safe and carries the suffix", () => {
    const id = makeRunId(new Date("2026-08-16T13:42:07.000Z"), "a3f9c1");

    expect(id).toBe("2026-08-16T13-42-07Z-a3f9c1");
    expect(id).not.toContain(":");
  });
});

describe("reserveRunDirectory", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "podcast-run-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("creates the run directory and returns its path", async () => {
    const created = await reserveRunDirectory(root, "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1");

    expect(created).toBe(join(root, "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1"));
    expect(await readdir(join(root, "module-06-mcp"))).toEqual(["2026-08-16T13-42-07Z-a3f9c1"]);
  });

  it("refuses an existing directory rather than overwriting it", async () => {
    // Runs are evidence. Silently replacing one destroys the artifact someone
    // is comparing against, and the refusal must happen before the model call
    // so a name clash never costs money.
    await reserveRunDirectory(root, "doc", "run-1");

    await expect(reserveRunDirectory(root, "doc", "run-1")).rejects.toThrow(/already exists/);
  });

  it("allows two runs for the same document", async () => {
    await reserveRunDirectory(root, "doc", "run-1");

    await expect(reserveRunDirectory(root, "doc", "run-2")).resolves.toContain("run-2");
  });
});
