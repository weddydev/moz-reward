import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The E2E server (port 3100, APP_ENV=test) builds into its own folder so it can run beside `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Do not advertise the framework (SECURITY §5 baseline).
  poweredByHeader: false,
  // Keep the dev badge out of E2E screenshots and visual snapshots; normal `pnpm dev` still shows it.
  ...(process.env.APP_ENV === "test" ? { devIndicators: false as const } : {}),
  // No Cache Components / Partial Prerendering: SECURITY §5 requires a per-request CSP script nonce, and a
  // prerendered shell's scripts can't carry one (Next CSP guide). Every page renders per request; the root
  // layout calls connection(). DECISIONS 2026-11-09.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
