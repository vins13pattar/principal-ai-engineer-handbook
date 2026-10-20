import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@handbook/video",
    environment: "node",
    include: ["scripts/**/*.test.ts", "src/**/*.test.ts"],
  },
});
