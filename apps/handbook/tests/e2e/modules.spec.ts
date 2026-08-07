import { expect, test } from "@playwright/test";

test.describe("learn modules v0.3", () => {
  test("Module 2 renders its idempotent-retry sequence diagram", async ({ page }) => {
    await page.goto("./learn/modules/02-distributed-systems/");
    await expect(
      page.getByRole("heading", { name: "Module 2: Distributed Systems", level: 1 }),
    ).toBeVisible();
    await expect(page.locator(".handbook-mermaid svg")).toBeVisible();
  });

  test("Module 3 renders its streaming-path diagram", async ({ page }) => {
    await page.goto("./learn/modules/03-networking/");
    await expect(
      page.getByRole("heading", { name: "Module 3: Networking", level: 1 }),
    ).toBeVisible();
    await expect(page.locator(".handbook-mermaid svg")).toBeVisible();
  });
});

test.describe("learn modules v0.5", () => {
  test("Module 8 renders its RAG pipelines diagram", async ({ page }) => {
    await page.goto("./learn/modules/08-rag/");
    await expect(page.getByRole("heading", { name: "Module 8: RAG", level: 1 })).toBeVisible();
    await expect(page.locator(".handbook-mermaid svg")).toBeVisible();
  });

  test("Module 9 renders its serving-pipeline diagram", async ({ page }) => {
    await page.goto("./learn/modules/09-model-serving/");
    await expect(
      page.getByRole("heading", { name: "Module 9: Model Serving", level: 1 }),
    ).toBeVisible();
    await expect(page.locator(".handbook-mermaid svg")).toBeVisible();
  });
});

test.describe("architecture", () => {
  test("Async AI Gateway architecture page renders its request-flow diagram", async ({ page }) => {
    await page.goto("./architecture/systems/async-ai-gateway/");
    await expect(
      page.getByRole("heading", { name: "Architecture: Async AI Gateway", level: 1 }),
    ).toBeVisible();
    await expect(page.locator(".handbook-mermaid svg")).toBeVisible();
  });
});

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
