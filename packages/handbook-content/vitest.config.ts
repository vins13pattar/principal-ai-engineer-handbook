import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@handbook/content",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
