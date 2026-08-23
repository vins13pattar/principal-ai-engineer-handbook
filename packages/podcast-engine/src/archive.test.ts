import { describe, expect, it } from "vitest";
import { ARCHIVE_VERSION, archivePath, parseArchive } from "./archive.ts";

function archive(overrides: Record<string, unknown> = {}) {
  return {
    archiveVersion: ARCHIVE_VERSION,
    slug: "module-06-mcp",
    meta: { documentId: "module:06-mcp" },
    plan: { beats: [{ title: "The integration problem" }] },
    script: { turns: [{ speaker: "host", beat: 1, text: "What did MCP replace?" }] },
    ...overrides,
  };
}

describe("parseArchive", () => {
  it("accepts an archive it could re-render from", () => {
    expect(parseArchive(archive(), "episodes/module-06-mcp.json").slug).toBe("module-06-mcp");
  });

  it("names the file in every complaint", () => {
    // These are read in a loop over sixty-odd files. "not an object" without a
    // path sends someone opening them one at a time.
    expect(() => parseArchive(null, "episodes/broken.json")).toThrow("episodes/broken.json");
  });

  it("refuses a version it does not understand", () => {
    expect(() => parseArchive(archive({ archiveVersion: 2 }), "x.json")).toThrow("expected 1");
  });

  it("refuses an archive with no turns, which would render an empty episode", () => {
    expect(() => parseArchive(archive({ script: { turns: [] } }), "x.json")).toThrow("no turns");
  });

  it("refuses a truncated write rather than rendering half an episode", () => {
    expect(() => parseArchive(archive({ script: undefined }), "x.json")).toThrow("no script turns");
  });
});

describe("archivePath", () => {
  it("puts an episode where the re-render loop looks for it", () => {
    expect(archivePath("adr-0001-astro-starlight-platform")).toBe(
      "episodes/adr-0001-astro-starlight-platform.json",
    );
  });
});
