/**
 * `pnpm e2e:ci-webkit` — CI only (ci.yml, every push): the WebKit half of the task gate (DECISIONS 22 Nov).
 * gate:task runs the task's specs on the three Chromium projects in the Linux container; no laptop WebKit is
 * evidence, so CI runs, on `webkit` + `iphone14` against the production build already built in the job:
 *   1. the specs tagged with a task ID named in the pushed commits (`[PD-03]` …);
 *   2. the specs whose test-side files changed (Playwright `--only-changed`).
 * A push that touches a file every page depends on (`EVERY_PAGE_GLOBS`: root layout, global CSS, proxy, Next
 * config, E2E fixtures) runs every spec on both projects instead (CLAUDE.md "every-page" rule; `--only-changed`
 * follows test-side imports only, so it would miss them: PD-A close review HIGH). So does a range that can't be
 * computed (a manual run on main: base = HEAD).
 * Base of the pushed range: the previous main on a push to main, else the fork point from origin/main (every
 * commit of a wip branch, each push). Needs fetch-depth 0. Exit 0 only if every run passed.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { CI_WEBKIT_PROJECTS, grepFor, TASK_ID } from "./gate-task";
import { isDirectRun } from "../src/lib/is-direct-run";

const ZERO = /^0*$/;

export const taskIdsIn = (messages: string): string[] => [
  ...new Set([...messages.matchAll(TASK_ID)].map((m) => m[1] ?? "")),
];

export function webkitBase(push: { ref: string; before: string }, forkPoint: () => string): string {
  return push.ref === "refs/heads/main" && !ZERO.test(push.before) ? push.before : forkPoint();
}

/** Files every page depends on: a change to one runs the whole suite on WebKit, not only the task's specs. */
export const EVERY_PAGE_GLOBS = [
  "src/app/layout.tsx",
  "src/app/globals.css",
  "src/styles/**",
  "src/proxy.ts",
  "next.config.ts",
  "tests/e2e/support/**",
  "playwright.config.ts",
];

export const touchesEveryPage = (files: string[]): boolean =>
  files.some((f) => EVERY_PAGE_GLOBS.some((g) => path.posix.matchesGlob(f, g)));

export function ciWebkitRuns(ids: string[], base: string, everyPage = false): string[][] {
  const common = [
    ...CI_WEBKIT_PROJECTS.flatMap((p) => ["--project", p]),
    "--fail-on-flaky-tests",
    "--pass-with-no-tests",
  ];
  if (everyPage) return [common];
  return [
    ...(ids.length > 0 ? [[...common, "--grep", grepFor(ids)]] : []),
    [...common, `--only-changed=${base}`],
  ];
}

function git(args: string[]): string {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function main(): void {
  const base = webkitBase(
    { ref: process.env.GITHUB_REF ?? "", before: process.env.PUSH_BEFORE ?? "" },
    () => git(["merge-base", "origin/main", "HEAD"]),
  );
  const head = git(["rev-parse", "HEAD"]);
  const range = base === head ? "" : `${base}..HEAD`;
  const files = range ? git(["diff", "--name-only", range]).split("\n").filter(Boolean) : [];
  const everyPage = !range || touchesEveryPage(files);
  const ids = range ? taskIdsIn(git(["log", "--format=%B", range])) : [];
  console.warn(
    `[e2e:ci-webkit] base ${base.slice(0, 7)}, tasks ${ids.join(", ") || "(none)"}${everyPage ? "; every-page change or no range: every spec" : ""}`,
  );
  for (const args of ciWebkitRuns(ids, base, everyPage)) {
    const r = spawnSync("pnpm", ["e2e", ...args], { stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

if (isDirectRun(import.meta.url)) main();
