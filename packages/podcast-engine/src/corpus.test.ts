import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSourcePack, loadAllDocuments } from "@handbook/content";
import { FakeLlm } from "@handbook/podcast-providers";
import { deriveExcerptIds } from "./ids.ts";
import { planEpisode } from "./plan.ts";

// Fixtures do not contain duplicate headings, punctuation-only headings, or
// non-ASCII. Real pages do, and that is the class of bug id derivation has.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("against the live content tree", () => {
  it("derives globally unique ids for every pack in the corpus", async () => {
    const documents = await loadAllDocuments(REPO_ROOT);

    for (const id of documents.keys()) {
      const pack = buildSourcePack(documents, id);
      const ids = deriveExcerptIds(pack.excerpts);

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((value) => value.length > 0)).toBe(true);
    }
  });

  it("plans an episode from a real pack", async () => {
    const documents = await loadAllDocuments(REPO_ROOT);
    const pack = buildSourcePack(documents, "module:06-mcp");
    const ids = deriveExcerptIds(pack.excerpts);
    expect(ids.length).toBeGreaterThan(1);

    const llm = new FakeLlm([
      {
        title: "What MCP actually standardises",
        throughLine: "MCP is a transport contract, not a capability.",
        beats: [
          { title: "Open", intent: "Frame it", excerptIds: [ids[0]], weight: 2 },
          { title: "Close", intent: "Land it", excerptIds: [ids[1]], weight: 1 },
        ],
        unsupported: [],
      },
    ]);

    const { plan } = await planEpisode(
      pack,
      {
        requestedSeconds: 2400,
        expansionFactor: 3,
        charsPerSecond: 16.2,
        maxRenderSeconds: 300,
        synthesisCost: { fixedSeconds: 3.16, marginalRtf: 0.073 },
      },
      llm,
    );

    expect(plan.sourceHash).toBe(pack.sourceHash);
    expect(plan.plannedSeconds).toBeGreaterThan(0);
    expect(plan.plannedSeconds).toBeLessThanOrEqual(2400);
    expect(plan.segmentBudget.projectedSeconds).toBeLessThanOrEqual(300);
  });
});
