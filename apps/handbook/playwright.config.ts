import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;
// Bind and poll the same literal address. `astro preview` defaults to the
// hostname "localhost", which on a GitHub runner can resolve to ::1 only — the
// server comes up healthy while Playwright polls 127.0.0.1 and times out after
// two minutes with nothing in the log to explain it.
const HOST = "127.0.0.1";
const ORIGIN = `http://${HOST}:${PORT}/`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: ORIGIN,
    trace: "on-first-retry",
  },
  webServer: {
    // Assumes `pnpm build` has already produced `dist/` — run it first locally;
    // CI runs it as a separate step so the build itself is checked independently.
    command: `pnpm preview --host ${HOST} --port ${PORT}`,
    url: ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Without these the preview server's own output is swallowed, so a server
    // that failed to start looks exactly like one listening on the wrong
    // address: a bare 120s timeout with nothing to diagnose.
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
