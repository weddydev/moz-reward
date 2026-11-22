import "./scripts/load-env";
import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT, e2eServerEnv } from "./tests/e2e/support/server-env";

/** E2E_BASE_URL points the suite at a deployed environment (staging smoke); otherwise a local test server. */
const isRemote = Boolean(process.env.E2E_BASE_URL);
/**
 * Local server mode (P0-14). Default `prod`: `next start` on the build `pnpm e2e` made in `.next-e2e` — the
 * evidence run. `dev` (`pnpm e2e:dev`): `next dev`, inner loop only. A running server is reused only in dev
 * mode, so a stray `next dev` on :3100 can never pass for a production run (the port clash fails loudly).
 */
const devServer = process.env.E2E_MODE === "dev";
const serverCommand = devServer
  ? `pnpm exec next dev --port ${E2E_PORT}`
  : `pnpm exec next start --port ${E2E_PORT}`;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;

// Locally, the Playwright process shares the server's env so spec-level factories hit the same database.
if (!isRemote) Object.assign(process.env, e2eServerEnv());

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  globalSetup: "./tests/e2e/support/warm-up.ts",
  fullyParallel: true,
  // Visual snapshots (@visual) compare against per-OS baselines, so they run only when asked for
  // (VISUAL=1: `pnpm gate:phase`, or `pnpm e2e:visual`), never in an ordinary run or in CI.
  // Perf-budget specs (@perf: CPU-throttled fps / long-task budgets) run only on their own, one worker
  // (PERF=1 … --grep @perf --workers 1: gate:task, gate:phase, CI, nightly), so parallel load can't decide
  // them (process audit 21 Nov: 55.6 fps under a 5-project run, 60 fps alone). Frame-rate budgets (@fps: fps
  // and p95 frame time) also need FPS=1: they measure the machine as much as the code, so they run on CI's fixed
  // runners nightly and in gate:phase, never in a push or task gate (DECISIONS 22 Nov).
  ...(() => {
    const skip = [
      ...(process.env.VISUAL ? [] : ["@visual"]),
      ...(process.env.PERF ? [] : ["@perf"]),
      ...(process.env.FPS ? [] : ["@fps"]),
    ];
    return skip.length ? { grepInvert: new RegExp(skip.join("|")) } : {};
  })(),
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // `pnpm e2e:linux`: the browsers run in the Linux Playwright image (scripts/e2e-linux.ts), the runner and the
    // production server stay on this machine.
    ...(process.env.PW_WS_ENDPOINT
      ? { connectOptions: { wsEndpoint: process.env.PW_WS_ENDPOINT } }
      : {}),
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
    // Lighthouse CI (DESIGN §12): only with LIGHTHOUSE=1 (`pnpm test:lighthouse`, `pnpm gate:phase`), so an
    // ordinary `pnpm e2e` or CI run never picks it up. Serial within the file: one audit at a time.
    ...(process.env.LIGHTHOUSE
      ? [{ name: "lighthouse", testDir: "./tests/perf", fullyParallel: false }]
      : []),
    // Molten parity (PD-01, tests/parity): only with PARITY=1 (`pnpm test:parity`, gate:task for PD tasks, CI).
    // Page against reference in the same browser and OS, at device scale 2; viewports are set per test.
    ...(process.env.PARITY
      ? [
          {
            name: "parity-chromium",
            testDir: "./tests/parity",
            timeout: 90_000, // dozens of DSF-2 captures per test (WebKit ~15 s alone)
            use: { ...devices["Desktop Chrome"], deviceScaleFactor: 2 },
          },
          {
            name: "parity-webkit",
            testDir: "./tests/parity",
            timeout: 90_000, // dozens of DSF-2 captures per test (WebKit ~15 s alone)
            use: { ...devices["Desktop Safari"], deviceScaleFactor: 2 },
          },
        ]
      : []),
  ],
  // Remote targets (staging) are already running: no local web server at all.
  ...(isRemote
    ? {}
    : {
        webServer: {
          command: `pnpm exec tsx tests/e2e/support/prepare-server.ts && ${serverCommand}`,
          url: baseURL,
          reuseExistingServer: devServer && !process.env.CI,
          timeout: 180_000,
          env: e2eServerEnv(),
          stdout: "ignore" as const,
          stderr: "pipe" as const,
        },
      }),
});
