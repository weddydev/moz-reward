import { staticSecurityHeaders } from "./src/lib/static-security-headers";
import type { NextConfig } from "next";

/** Prefetch requests skip src/proxy.ts (keep in step with its matcher); they get the static headers here. */
const PREFETCH = [
  { type: "header" as const, key: "next-router-prefetch" },
  { type: "header" as const, key: "purpose", value: "prefetch" },
];
const staticHeaders = Object.entries(staticSecurityHeaders("/")).map(([key, value]) => ({
  key,
  value,
}));

const nextConfig: NextConfig = {
  // The E2E server (port 3100, APP_ENV=test) builds into its own folder so it can run beside `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The Docker build (NEXT_OUTPUT=standalone) ships only traced files: no dev dependencies or tool binaries in the
  // runtime image (P0-15, C-21). Local and E2E builds keep `next start` (standalone needs symlinks on Windows).
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  // Do not advertise the framework (SECURITY §5 baseline).
  poweredByHeader: false,
  experimental: { authInterrupts: true },
  // next/image (PD-08, DESIGN §12 "AVIF/WebP via next/image"): set explicitly, never library defaults (ENGINEERING
  // §14). Only the demo shop photos are optimised (uploaded images are sized variants on the CDN, P2-05); any
  // other local path or a query string is refused (400), so the optimiser can't be used to enumerate files.
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75],
    localPatterns: [{ pathname: "/demo/shops/**", search: "" }],
    remotePatterns: [],
    dangerouslyAllowSVG: false,
  },
  // SEC-10: prefetch responses still carry HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP and
  // X-Frame-Options (SECURITY §5). Two rules because `has` entries must all match.
  headers: () =>
    Promise.resolve(PREFETCH.map((h) => ({ source: "/:path*", has: [h], headers: staticHeaders }))),
  // `next build` type-checks app code only (tests, scripts and tool configs are checked by `pnpm typecheck`), so
  // the Docker build context can leave them out. Build errors still fail the build.
  typescript: { tsconfigPath: "tsconfig.build.json" },
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
