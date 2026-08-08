import { describe, expect, it } from "vitest";
import { extractFrontmatter, parseFreshnessDeclaration } from "./frontmatter.ts";

const page = (frontmatter: string) => `---\n${frontmatter}\n---\n\n## Executive Summary\n\nBody.\n`;

describe("extractFrontmatter", () => {
  it("returns the frontmatter block", () => {
    expect(extractFrontmatter(page("title: Test"))).toBe("title: Test");
  });

  it("returns null for a page with no frontmatter", () => {
    expect(extractFrontmatter("## Heading\n\nBody.\n")).toBeNull();
  });
});

describe("parseFreshnessDeclaration", () => {
  it("reads a complete declaration", () => {
    const declaration = parseFreshnessDeclaration(
      page(
        [
          "title: Module 6",
          "freshness:",
          "  classification: fast-moving",
          '  verifiedAgainst: "MCP 2026-07-28"',
          "  verifiedOn: 2026-08-08",
          "  reviewAfterDays: 60",
          "moduleNumber: 6",
        ].join("\n"),
      ),
    );

    expect(declaration).not.toBeNull();
    expect(declaration!.classification).toBe("fast-moving");
    expect(declaration!.verifiedAgainst).toBe("MCP 2026-07-28");
    expect(declaration!.verifiedOn?.toISOString().slice(0, 10)).toBe("2026-08-08");
    expect(declaration!.reviewAfterDays).toBe(60);
  });

  it("stops at the next top-level key rather than swallowing it", () => {
    const declaration = parseFreshnessDeclaration(
      page(
        ["freshness:", "  classification: stable", "moduleNumber: 3", "  nested: ignored"].join(
          "\n",
        ),
      ),
    );

    expect(declaration!.classification).toBe("stable");
    expect(declaration!.verifiedAgainst).toBeUndefined();
  });

  it("returns null when there is no freshness block", () => {
    expect(parseFreshnessDeclaration(page("title: Test"))).toBeNull();
  });

  it("returns null for an unrecognised classification rather than guessing", () => {
    expect(
      parseFreshnessDeclaration(page(["freshness:", "  classification: volatile"].join("\n"))),
    ).toBeNull();
  });

  it("ignores an unparseable date instead of inventing one", () => {
    const declaration = parseFreshnessDeclaration(
      page(["freshness:", "  classification: fast-moving", "  verifiedOn: not-a-date"].join("\n")),
    );
    expect(declaration!.verifiedOn).toBeUndefined();
  });
});
