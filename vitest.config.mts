import react from "@vitejs/plugin-react";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside the react-server condition; tests import server modules directly.
    alias: { "server-only": new URL("./tests/stubs/empty.ts", import.meta.url).pathname },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    restoreMocks: true,
    // App code always talks to the test database/redis during tests.
    env: {
      APP_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
      REDIS_URL: process.env.REDIS_URL_TEST ?? "",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/app/dev/**"],
      thresholds: { "src/server/services/**": { lines: 90, branches: 90 } },
    },
  },
});
