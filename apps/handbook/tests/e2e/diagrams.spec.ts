import { readdirSync, readFileSync } from "node:fs";
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

function findPages(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) findPages(path, out);
    else if (entry.name.endsWith(".mdx")) out.push(path);
  }
  return out;
}

/**
 * Maps a content file to the URL it renders at:
 * `architecture/systems/foo.mdx` → `./architecture/systems/foo/`, and a
 * section's `index.mdx` → the section root.
 */
function pageUrl(pagePath: string): string {
  const relativePath = relative(CONTENT_ROOT, pagePath).replaceAll("\\", "/");
  const withoutExtension = relativePath.replace(/\.mdx$/, "").replace(/\/index$/, "");
  return `./${withoutExtension}/`;
}

/**
 * Discovered by scanning pages for `.mmd` imports rather than by locating
 * `.mmd` files and inferring their page.
 *
 * The earlier approach derived the URL from each diagram's own path, which
 * silently missed every page that imports a diagram from somewhere else — the
 * Architecture pages all reuse their lab's `.mmd`, so none of them were covered
 * despite the suite reporting green.
 */
const pagesWithDiagrams = [
  ...new Set(
    findPages(CONTENT_ROOT)
      .filter((page) => /from\s+["'][^"']+\.mmd\?raw["']/.test(readFileSync(page, "utf-8")))
      .map(pageUrl),
  ),
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
