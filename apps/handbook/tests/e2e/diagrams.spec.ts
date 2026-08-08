import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Every `.mmd` diagram in the content tree must actually render in a browser.
 *
 * Mermaid parses client-side, so `pnpm build` cannot catch a syntax error — a
 * broken diagram builds cleanly and then fails on the live page. Asserting an
 * `svg` is present is not enough either, because Mermaid renders its *error*
 * graphic as an `svg` too. `Mermaid.astro` sets `data-mermaid-rendered` only on
 * a successful `mermaid.render()`, so that attribute is the honest signal.
 *
 * This suite is generated from the filesystem rather than hand-listed, so a new
 * diagram is covered the moment it is added and cannot be forgotten.
 */

const CONTENT_ROOT = join(import.meta.dirname, "..", "..", "src", "content", "docs");

function findDiagramFiles(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) findDiagramFiles(path, out);
    else if (entry.name.endsWith(".mmd")) out.push(path);
  }
  return out;
}

/**
 * Maps a diagram file to the page that imports it. Diagrams are named
 * `<page-slug>.<diagram-name>.mmd` beside their page, so the slug is everything
 * before the first dot: `learn/modules/06-mcp.stateless-routing.mmd` renders on
 * `/learn/modules/06-mcp/`.
 */
function pageUrlForDiagram(diagramPath: string): string {
  const relativePath = relative(CONTENT_ROOT, diagramPath).replaceAll("\\", "/");
  const withoutDiagramSuffix = relativePath.replace(/\.[^/.]+\.mmd$/, "");
  return `./${withoutDiagramSuffix}/`;
}

const pagesWithDiagrams = [
  ...new Set(findDiagramFiles(CONTENT_ROOT).map(pageUrlForDiagram)),
].sort();

test.describe("mermaid diagrams", () => {
  test("the content tree actually contains diagrams to check", () => {
    // Guards against the glob silently matching nothing, which would make every
    // test below vacuously pass.
    expect(pagesWithDiagrams.length).toBeGreaterThan(0);
  });

  for (const url of pagesWithDiagrams) {
    test(`every diagram on ${url} renders without a syntax error`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });

      await page.goto(url);

      const diagrams = page.locator(".handbook-mermaid[data-mermaid-source]");
      const count = await diagrams.count();
      expect(count, `expected at least one diagram on ${url}`).toBeGreaterThan(0);

      for (let index = 0; index < count; index += 1) {
        // Set only after a successful mermaid.render(); a parse failure leaves
        // it absent and logs to console instead.
        await expect(diagrams.nth(index)).toHaveAttribute("data-mermaid-rendered", "true");
        await expect(diagrams.nth(index).locator("svg")).toBeVisible();
      }

      expect(
        consoleErrors.filter((text) => text.includes("handbook-mermaid")),
        `mermaid reported a rendering failure on ${url}`,
      ).toEqual([]);
    });
  }
});
