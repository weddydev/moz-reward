/**
 * `pnpm e2e` — Playwright against a PRODUCTION build (P0-14, TESTING §4: the evidence run).
 *   1. `next build` into `.next-e2e` with the E2E env (APP_ENV=test, NODE_ENV=production). The build is
 *      reused while the app's sources are unchanged (fingerprint below), so editing a spec costs no rebuild.
 *   2. `playwright test <args>`; playwright.config starts `next start` on :3100 (E2E_MODE=prod).
 * `pnpm e2e:dev` (`--dev`) runs the old `next dev` server instead: fast inner loop only, never evidence.
 * Flags: `--dev`, `--rebuild` (ignore the fingerprint), `--build-only`. Everything else goes to Playwright.
 * Needs `pnpm services:up`. Never touches tsconfig.json (it already includes `.next-e2e/types`).
 */
import "./load-env";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { isDirectRun } from "../src/lib/is-direct-run";
import { e2eServerEnv } from "../tests/e2e/support/server-env";

export const E2E_DIST_DIR = ".next-e2e";
const STAMP = path.join(E2E_DIST_DIR, "e2e-build-stamp");
const LOG = path.join(".artifacts", "e2e", "build.log");
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const require = createRequire(import.meta.url);
/** CLIs run with `node` directly (no shell), so arguments like `--grep "a b"` survive on Windows too. */
export const NEXT_CLI = require.resolve("next/dist/bin/next");
export const PLAYWRIGHT_CLI = require.resolve("@playwright/test/cli");

/** Paths that never change the built app: editing them must not force a rebuild. */
export const NON_BUILD_PATHSPECS = [
  ":!tests",
  ":!docs",
  ":!progress",
  ":!design",
  ":!.claude",
  ":!.github",
  ":!infra",
  ":!*.md",
];

function git(args: string[]): string {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

/**
 * Fingerprint of everything the build reads: tracked file blobs (index), unstaged edits, untracked files'
 * contents, and the E2E env. Anything else (a lockfile or config edit included) changes it.
 */
export function buildFingerprint(env: Record<string, string>): string {
  const h = createHash("sha256");
  h.update(git(["ls-files", "-s", "--", ".", ...NON_BUILD_PATHSPECS]));
  h.update(git(["diff", "HEAD", "--", ".", ...NON_BUILD_PATHSPECS]));
  const untracked = git([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ".",
    ...NON_BUILD_PATHSPECS,
  ])
    .split("\n")
    .filter(Boolean)
    .sort();
  for (const f of untracked) {
    h.update(f);
    if (existsSync(f)) h.update(readFileSync(f));
  }
  h.update(JSON.stringify(env, Object.keys(env).sort()));
  return h.digest("hex");
}

/** Builds the E2E production bundle unless an identical one exists. Returns false if the build failed. */
export function ensureProductionBuild(opts: { force?: boolean } = {}): {
  ok: boolean;
  reused: boolean;
  seconds: number;
} {
  const env = e2eServerEnv();
  const fingerprint = buildFingerprint(env);
  const built = existsSync(path.join(E2E_DIST_DIR, "BUILD_ID")) && existsSync(STAMP);
  if (!opts.force && built && readFileSync(STAMP, "utf8") === fingerprint) {
    console.warn(`[e2e] production build reused (${E2E_DIST_DIR}, sources unchanged)`);
    return { ok: true, reused: true, seconds: 0 };
  }
  console.warn(`[e2e] next build → ${E2E_DIST_DIR} (APP_ENV=test, NODE_ENV=production)…`);
  mkdirSync(path.dirname(LOG), { recursive: true });
  const started = Date.now();
  // NODE_ENV is dropped so `next build` sets production itself (a stray NODE_ENV=test would leak into it).
  const buildEnv: NodeJS.ProcessEnv = { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: "1" };
  Reflect.deleteProperty(buildEnv, "NODE_ENV");
  const r = spawnSync(process.execPath, [NEXT_CLI, "build"], {
    env: buildEnv,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  // stdout/stderr are null when the process could not be spawned, whatever the types say.
  const output = `${text(r.stdout)}\n${text(r.stderr)}${r.error ? `\n${r.error.message}` : ""}`;
  writeFileSync(LOG, output);
  if (r.status !== 0) {
    const tail = output.trim().split("\n").slice(-30).join("\n");
    console.error(`[e2e] next build FAILED after ${seconds}s (full log: ${LOG})\n${tail}`);
    return { ok: false, reused: false, seconds };
  }
  // Written only after a successful build, so a failed or interrupted build is never reused.
  writeFileSync(STAMP, fingerprint);
  console.warn(`[e2e] production build ok in ${seconds}s`);
  return { ok: true, reused: false, seconds };
}

function main(): void {
  const args = process.argv.slice(2);
  const dev = args.includes("--dev");
  const force = args.includes("--rebuild");
  const buildOnly = args.includes("--build-only");
  // `--visual`: only the @visual snapshot tests (add `--update-snapshots` to accept a new look).
  const visual = args.includes("--visual");
  const pwArgs = args.filter(
    (a) => !["--dev", "--rebuild", "--build-only", "--visual"].includes(a),
  );

  if (!dev && !process.env.E2E_BASE_URL) {
    const build = ensureProductionBuild({ force });
    if (!build.ok) process.exit(1);
    if (buildOnly) process.exit(0);
  }
  const r = spawnSync(
    process.execPath,
    [PLAYWRIGHT_CLI, "test", ...(visual ? ["--grep", "@visual"] : []), ...pwArgs],
    {
      stdio: "inherit",
      env: { ...process.env, E2E_MODE: dev ? "dev" : "prod", ...(visual ? { VISUAL: "1" } : {}) },
    },
  );
  process.exit(r.status ?? 1);
}

if (isDirectRun(import.meta.url)) main();
