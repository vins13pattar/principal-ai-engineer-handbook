import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@handbook/podcast-providers",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
