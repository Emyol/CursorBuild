import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["contract/src/**/*.test.ts", "drawing/**/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
  },
});
