import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Live smoke (TESTING §9): real providers, run against staging config only via `pnpm test:live`.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": new URL("./tests/stubs/empty.ts", import.meta.url).pathname },
  },
  test: {
    name: "live",
    environment: "node",
    include: ["tests/live/**/*.live.test.ts"],
    testTimeout: 30_000,
  },
});
