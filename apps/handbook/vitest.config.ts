import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@handbook/site",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
