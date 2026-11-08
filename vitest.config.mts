import react from "@vitejs/plugin-react";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const shared = {
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside the react-server condition; tests import server modules directly.
    alias: { "server-only": new URL("./tests/stubs/empty.ts", import.meta.url).pathname },
  },
};

/** Every test run is APP_ENV=test (enables the test-only seeding API and Better Auth test utils). */
const testEnv = {
  APP_ENV: "test",
  APP_URL: "http://localhost:3000",
  EMAIL_PROVIDER: "smtp",
  SMTP_HOST: process.env.SMTP_HOST ?? "localhost",
  REDIS_URL: process.env.REDIS_URL_TEST ?? "redis://:moz@localhost:6379/1",
  // Fixed, obviously fake values: tests must pass on a fresh clone and never use a developer's real secrets.
  AUTH_SECRET: "test-only-auth-secret-not-used-anywhere-else",
  EMAIL_FROM: "Moz Rewards Test <test@test.moz.invalid>",
};

export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          // Projects with different maxWorkers must run in separate groups: unit first, then integration.
          sequence: { groupOrder: 0 },
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
          setupFiles: ["./tests/setup.ts"],
          restoreMocks: true,
          // Unit tests never touch a database; a placeholder URL keeps env validation honest.
          env: { ...testEnv, DATABASE_URL: "postgres://unit:unit@127.0.0.1:1/none" },
        },
      },
      {
        ...shared,
        test: {
          name: "integration",
          sequence: { groupOrder: 1 },
          environment: "node",
          include: ["tests/integration/**/*.test.ts", "tests/authz/**/*.test.ts"],
          globalSetup: ["./tests/global-setup.integration.ts"],
          setupFiles: ["./tests/setup.ts", "./tests/setup.integration.ts"],
          restoreMocks: true,
          maxWorkers: 4, // must match INTEGRATION_WORKERS in tests/support/db.ts
          // Cold imports of Better Auth + DB client take 2–6 s under 4 parallel workers (Windows); unit stays 5 s.
          testTimeout: 15_000,
          env: testEnv,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/app/dev/**", "src/features/dev/**"],
      thresholds: { "src/server/services/**": { lines: 90, branches: 90 } },
    },
  },
});
