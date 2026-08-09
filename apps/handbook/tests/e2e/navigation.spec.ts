import { expect, test } from "@playwright/test";

/**
 * The sidebar is the reader's sense of place: every section group is collapsed,
 * and Starlight opens exactly the one holding the current page. These tests pin
 * that behavior, because it is a config property (`collapsed: true` plus a flat
 * two-level shape) that a well-meaning edit could silently undo — a sidebar with
 * every group expanded still renders, still passes the build, and is unusable.
 */

const SECTION_GROUPS = [
  "Learn — the concepts",
  "Build — running labs",
  "Architecture — design reviews",
  "Interview — by round",
  "Reference — quick lookups",
  "Cheat Sheets",
  "Decision Records — why it is built this way",
];

/** Sidebar `<details>` groups, in sidebar order, with their open state. */
async function groupState(page: import("@playwright/test").Page) {
  return page.locator("nav.sidebar details").evaluateAll((nodes) =>
    nodes.map((node) => ({
      label: node.querySelector("summary .group-label")?.textContent?.trim() ?? "",
      open: (node as HTMLDetailsElement).open,
    })),
  );
}

test.describe("sidebar", () => {
  test("shows one collapsed group per section, in order", async ({ page }) => {
    await page.goto("./roadmap/");
    const groups = await groupState(page);
    expect(groups.map((group) => group.label)).toEqual(SECTION_GROUPS);
  });

  test("is two levels deep, never three", async ({ page }) => {
    await page.goto("./learn/modules/06-mcp/");
    // A nested group would put a <details> inside a <details>. The old shape did
    // exactly that ("Learn > Modules > Module 6") and cost a click for nothing.
    await expect(page.locator("nav.sidebar details details")).toHaveCount(0);
  });

  const SECTION_PAGES = [
    { open: "Learn — the concepts", url: "./learn/modules/06-mcp/" },
    { open: "Build — running labs", url: "./build/labs/async-ai-gateway/" },
    {
      open: "Architecture — design reviews",
      url: "./architecture/systems/enterprise-rag-platform/",
    },
    { open: "Interview — by round", url: "./interview/tracks/ai-systems-coding/" },
    { open: "Reference — quick lookups", url: "./reference/lookups/raft/" },
  ];

  for (const { open, url } of SECTION_PAGES) {
    test(`opens only "${open}" on ${url}`, async ({ page }) => {
      await page.goto(url);
      const opened = (await groupState(page)).filter((group) => group.open);
      expect(opened.map((group) => group.label)).toEqual([open]);
    });
  }

  test("collapses every group on a page that belongs to no section", async ({ page }) => {
    await page.goto("./roadmap/");
    const opened = (await groupState(page)).filter((group) => group.open);
    expect(opened).toEqual([]);
  });

  test("links to Start here above the sections", async ({ page }) => {
    await page.goto("./roadmap/");
    const first = page.locator("nav.sidebar ul.top-level > li").first();
    await expect(first.getByRole("link", { name: "Start here" })).toBeVisible();
  });
});

test.describe("start here", () => {
  test("routes to every section it names", async ({ page }) => {
    await page.goto("./start-here/");
    for (const href of [
      "/learn/",
      "/build/",
      "/architecture/",
      "/interview/",
      "/reference/",
      "/cheatsheets/",
      "/adr/",
    ]) {
      await expect(page.locator(`main a[href="${href}"]`).first()).toBeVisible();
    }
  });
});
