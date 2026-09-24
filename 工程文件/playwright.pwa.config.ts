import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/pwa",
  outputDir: "test-results/pwa",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4174" },
  webServer: {
    command: "npm run preview -- --port 4174 --strictPort",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
