import { expect, test } from "@playwright/test";

test.describe("homepage", () => {
  test("loads with the hero and primary navigation", async ({ page }) => {
    await page.goto("./");
    await expect(page).toHaveTitle(/Principal AI Engineer Handbook/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "View on GitHub" })).toBeVisible();
  });

  test("links to every top-level section", async ({ page }) => {
    await page.goto("./");
    for (const label of ["Learn", "Build", "Architecture", "Interview"]) {
      await expect(page.getByRole("link", { name: label, exact: true }).first()).toBeVisible();
    }
  });
});

test.describe("dark mode", () => {
  test("toggling the theme updates the document attribute", async ({ page }) => {
    await page.goto("./");
    const html = page.locator("html");
    const initialTheme = await html.getAttribute("data-theme");

    const themeSelect = page.getByLabel("Select theme");
    await themeSelect.selectOption(initialTheme === "dark" ? "light" : "dark");

    await expect(html).not.toHaveAttribute("data-theme", initialTheme ?? "");
  });
});

test.describe("search", () => {
  test("opens the Pagefind search dialog", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: /search/i }).click();
    await expect(page.locator("dialog[open]")).toBeVisible();
  });
});

test.describe("build section", () => {
  test("renders the async-ai-gateway lab page with its Mermaid diagram", async ({ page }) => {
    await page.goto("./build/labs/async-ai-gateway/");
    await expect(page.getByRole("heading", { name: "Async AI Gateway", level: 1 })).toBeVisible();
    await expect(page.locator(".handbook-mermaid svg")).toBeVisible();
  });
});

test.describe("ADR section", () => {
  test("renders an ADR with its status summary", async ({ page }) => {
    await page.goto("./adr/decisions/0001-astro-starlight-platform/");
    await expect(page.locator(".handbook-adr-summary__status")).toHaveText("accepted");
  });
});
