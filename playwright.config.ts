import "./scripts/load-env";
import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT, e2eServerEnv } from "./tests/e2e/support/server-env";

/** E2E_BASE_URL points the suite at a deployed environment (staging smoke); otherwise a local test server. */
const isRemote = Boolean(process.env.E2E_BASE_URL);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;

// Locally, the Playwright process shares the server's env so spec-level factories hit the same database.
if (!isRemote) Object.assign(process.env, e2eServerEnv());

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  globalSetup: "./tests/e2e/support/warm-up.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    ...(process.env.STAGING_BASIC_AUTH_USER
      ? {
          httpCredentials: {
            username: process.env.STAGING_BASIC_AUTH_USER,
            password: process.env.STAGING_BASIC_AUTH_PASSWORD ?? "",
          },
        }
      : {}),
  },
  // TESTING §1: chromium + webkit (iOS Safari proxy) desktop, two phones, and a 1440 desktop.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "pixel7", use: { ...devices["Pixel 7"] } },
    { name: "iphone14", use: { ...devices["iPhone 14"] } },
    {
      name: "desktop1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  // Remote targets (staging) are already running: no local web server at all.
  ...(isRemote
    ? {}
    : {
        webServer: {
          command: `pnpm exec tsx tests/e2e/support/prepare-server.ts && pnpm exec next dev --port ${E2E_PORT}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: e2eServerEnv(),
          stdout: "ignore" as const,
          stderr: "pipe" as const,
        },
      }),
});
