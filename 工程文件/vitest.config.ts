import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["tests/e2e/**", "tests/pwa/**", "node_modules/**", "dist/**"],
  },
});
