import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The E2E server (port 3100, APP_ENV=test) builds into its own folder so it can run beside `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Keep the dev badge out of E2E screenshots and visual snapshots; normal `pnpm dev` still shows it.
  ...(process.env.APP_ENV === "test" ? { devIndicators: false as const } : {}),
  cacheComponents: true,
  partialPrefetching: true,
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
