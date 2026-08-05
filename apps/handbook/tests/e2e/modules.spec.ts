import { expect, test } from "@playwright/test";

test.describe("learn modules", () => {
  test("Module 0 renders its decision-flow diagram and component callouts", async ({ page }) => {
    await page.goto("./learn/modules/00-principal-engineer-mindset/");
    await expect(
      page.getByRole("heading", { name: "Module 0: Principal Engineer Mindset", level: 1 }),
    ).toBeVisible();
    await expect(page.locator(".handbook-mermaid svg")).toBeVisible();
    await expect(page.locator(".handbook-callout--accent")).toContainText(
      "Leverage cuts both ways",
    );
    await expect(page.getByRole("heading", { name: "Interview Questions" })).toBeVisible();
  });

  test("Module 1 renders its request-lifecycle diagram and links to the lab", async ({ page }) => {
    await page.goto("./learn/modules/01-production-python/");
    await expect(
      page.getByRole("heading", { name: "Module 1: Production Python", level: 1 }),
    ).toBeVisible();
    await expect(page.locator(".handbook-mermaid svg")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Read the full lab documentation" }),
    ).toHaveAttribute("href", "/build/labs/async-ai-gateway/");
  });
});
