import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:3199",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "tsx scripts/e2e-server.ts",
    url: "http://127.0.0.1:3199/api/health/ready",
    timeout: 120_000,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGINT", timeout: 5_000 },
    env: { ...process.env, PORT: "3199" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
