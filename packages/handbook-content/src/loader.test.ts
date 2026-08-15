import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLLECTION_NAMES, documentIdForUrl, EXPECTED_MINIMUM_PAGES } from "./collections.ts";
import { loadAllDocuments, loadCollection, parseDocument, splitIntoSections } from "./loader.ts";
import { buildSourcePack } from "./source-pack.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("documentIdForUrl", () => {
  it("maps a site link back to a document id", () => {
    expect(documentIdForUrl("/learn/modules/06-mcp/")).toBe("module:06-mcp");
    expect(documentIdForUrl("/build/labs/semantic-cache/")).toBe("lab:semantic-cache");
  });

  it("ignores an anchor, so the same page linked two ways is one document", () => {
    expect(documentIdForUrl("/learn/modules/06-mcp/#security")).toBe("module:06-mcp");
  });

  it("returns null for anything that is not a content page", () => {
    expect(documentIdForUrl("/learn/")).toBeNull();
    expect(documentIdForUrl("/roadmap/")).toBeNull();
    expect(documentIdForUrl("https://example.com/x/")).toBeNull();
  });
});

describe("splitIntoSections", () => {
  it("does not treat a comment inside a code fence as a heading", () => {
    const body = ["## Real", "prose", "```bash", "## not a heading", "```"].join("\n");

    const sections = splitIntoSections(body);

    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe("Real");
    expect(sections[0]!.body).toContain("## not a heading");
  });
});

describe("parseDocument", () => {
  it("fails loudly on a page with no frontmatter", () => {
    expect(() => parseDocument("module", "x", "x.mdx", "# Just a heading")).toThrow(
      /no YAML frontmatter/,
    );
  });

  it("fails loudly when a required field is missing rather than defaulting it", () => {
    const source = ["---", "title: Something", "---", "body"].join("\n");

    expect(() => parseDocument("module", "x", "x.mdx", source)).toThrow(/missing a string/);
  });
});

// These run against the real content tree rather than fixtures. A fixture
// would prove the parser handles the MDX I thought to write down; the point
// here is that it handles the MDX that actually exists.
describe("against the real handbook content", () => {
  // One assertion per collection, not a total. A total is exactly what let the
  // first version of this ship with two collections silently loading as empty:
  // fifty documents is "more than forty", and nothing said which fifty.
  it.each(COLLECTION_NAMES)("loads at least the expected number of %s pages", async (name) => {
    const documents = await loadCollection(REPO_ROOT, name);

    expect(documents.length).toBeGreaterThanOrEqual(EXPECTED_MINIMUM_PAGES[name]);
  });

  it("reads the sixteen Learn modules", async () => {
    const modules = await loadCollection(REPO_ROOT, "module");

    expect(modules).toHaveLength(16);
    expect(modules[0]!.slug).toBe("00-principal-engineer-mindset");
  });

  it("round-trips every document's own URL back to its id", async () => {
    // If a collection's urlPrefix is wrong, links between pages resolve to
    // nothing and every source pack quietly comes back with no related
    // documents -- which looks the same as a page that links to nobody.
    const documents = await loadAllDocuments(REPO_ROOT);

    const broken: string[] = [];
    for (const document of documents.values()) {
      if (documentIdForUrl(document.url) !== document.id) broken.push(document.id);
    }

    expect(broken).toEqual([]);
  });

  it("leaves no unstripped component tags in any section body", async () => {
    const documents = await loadAllDocuments(REPO_ROOT);

    const leaked: string[] = [];
    for (const document of documents.values()) {
      for (const section of document.sections) {
        // Only prose matters; code fences legitimately contain angle brackets.
        const prose = section.body.replace(/```[\s\S]*?```/g, "");
        if (/<\/?[A-Z][A-Za-z0-9]*[\s/>]/.test(prose)) {
          leaked.push(`${document.id} :: ${section.heading}`);
        }
      }
    }

    expect(leaked).toEqual([]);
  });

  it("carries the freshness declaration through on fast-moving pages", async () => {
    const documents = await loadAllDocuments(REPO_ROOT);
    const mcp = documents.get("reference:mcp");

    expect(mcp?.freshness?.classification).toBe("fast-moving");
    expect(mcp?.freshness?.verifiedAgainst).toBeTruthy();
  });

  it("finds the fifteen required sections on a Learn module", async () => {
    const documents = await loadAllDocuments(REPO_ROOT);
    const module = documents.get("module:15-agent-identity");

    // The content linter enforces fifteen `##` sections on a Learn module. If
    // the loader disagrees with the linter, one of them is parsing wrongly.
    expect(module!.sections).toHaveLength(15);
  });
});

describe("buildSourcePack against real content", () => {
  it("follows links out to related pages", async () => {
    const documents = await loadAllDocuments(REPO_ROOT);
    const pack = buildSourcePack(documents, "module:15-agent-identity");

    expect(pack.topic).toBeTruthy();
    expect(pack.related.length).toBeGreaterThan(0);
    expect(pack.excerpts.length).toBeGreaterThan(10);
  });

  it("never includes the primary document in its own related set", async () => {
    const documents = await loadAllDocuments(REPO_ROOT);
    const pack = buildSourcePack(documents, "module:06-mcp");

    expect(pack.related.map((d) => d.documentId)).not.toContain("module:06-mcp");
  });

  it("gives the same hash for the same inputs and a different one otherwise", async () => {
    const documents = await loadAllDocuments(REPO_ROOT);

    const a = buildSourcePack(documents, "module:06-mcp");
    const b = buildSourcePack(documents, "module:06-mcp");
    const other = buildSourcePack(documents, "module:08-rag");

    expect(a.sourceHash).toBe(b.sourceHash);
    expect(a.sourceHash).not.toBe(other.sourceHash);
  });

  it("records what it dropped instead of silently truncating", async () => {
    const documents = await loadAllDocuments(REPO_ROOT);
    const pack = buildSourcePack(documents, "module:06-mcp", { maxTokens: 1 });

    // Budget of one token: the primary is kept anyway, everything else is cut
    // and named. A pack that quietly returned only the primary would look
    // identical to a page with no related links.
    expect(pack.related).toEqual([]);
    expect(pack.droppedForBudget.length).toBeGreaterThan(0);
    expect(pack.estimatedTokens).toBeGreaterThan(1);
  });

  it("throws on an unknown document id rather than generating from nothing", async () => {
    const documents = await loadAllDocuments(REPO_ROOT);

    expect(() => buildSourcePack(documents, "module:does-not-exist")).toThrow(
      /unknown document id/,
    );
  });

  it("propagates the verification metadata a citation needs", async () => {
    const documents = await loadAllDocuments(REPO_ROOT);
    const pack = buildSourcePack(documents, "reference:mcp");

    expect(pack.primary.verifiedAgainst).toBeTruthy();
    expect(pack.primary.sourcePath).toMatch(/^apps\/handbook\/src\/content\/docs\//);
  });
});
