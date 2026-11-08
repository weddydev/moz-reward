import "./scripts/load-env";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isRemote = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: "./tests/e2e",
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
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } },
    },
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
    { name: "iphone-14", use: { ...devices["iPhone 14"] } },
  ],
  webServer: isRemote
    ? undefined
    : { command: "pnpm dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
