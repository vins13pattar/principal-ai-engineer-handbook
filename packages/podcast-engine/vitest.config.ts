import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@handbook/podcast-engine",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
