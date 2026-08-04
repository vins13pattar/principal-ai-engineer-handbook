import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@handbook/shared",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
