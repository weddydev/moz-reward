/**
 * `pnpm fix:changed` (21 Nov 2026): `pnpm fix` (ESLint --fix + Prettier --write) on the files changed since
 * HEAD, staged or not, plus untracked files, instead of the whole repo. Same tools, same config; the full lint
 * and format check still run in `pnpm check`, `gate:task` and CI, so nothing is checked less. Use the full
 * `pnpm fix` after changing ESLint or Prettier config (it can touch files nobody edited).
 * `--base <ref>`: compare with a ref instead of HEAD (e.g. `origin/main` for a whole wip branch).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isDirectRun } from "../src/lib/is-direct-run";

const LINTABLE = /\.(ts|tsx|mts|mjs|js|cjs)$/;
const FORMATTABLE = /\.(ts|tsx|mts|mjs|js|cjs|json|css|md|yml|yaml)$/;
/** Same exclusions as the pre-commit hook (lefthook.yml). */
const NOT_FORMATTED = [/^pnpm-lock\.yaml$/, /^docs\//, /^progress\//, /^\.claude\/skills\//];

export function selectFiles(paths: string[]): { lint: string[]; format: string[] } {
  const files = [...new Set(paths.map((p) => p.trim()).filter(Boolean))].sort();
  return {
    lint: files.filter((f) => LINTABLE.test(f)),
    format: files.filter((f) => FORMATTABLE.test(f) && !NOT_FORMATTED.some((re) => re.test(f))),
  };
}

function git(args: string[]): string[] {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.split("\n");
}

function run(cmd: string, args: string[]): number {
  // Windows needs a shell for pnpm.cmd; the arguments are repo file paths from git, passed as an array.
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  return r.status ?? 1;
}

function main(): void {
  const i = process.argv.indexOf("--base");
  const base = i >= 0 ? (process.argv[i + 1] ?? "HEAD") : "HEAD";
  const changed = [
    ...git(["diff", "--name-only", "--diff-filter=ACMR", base]),
    ...git(["ls-files", "--others", "--exclude-standard"]),
  ].filter((f) => f && existsSync(f));
  const { lint, format } = selectFiles(changed);
  if (lint.length === 0 && format.length === 0) {
    console.warn("[fix:changed] nothing changed");
    return;
  }
  // Paths go to the shell on Windows: refuse anything that isn't a plain path (git never gives us one).
  const bad = [...lint, ...format].find((f) => !/^[\w./@+-]+$/.test(f));
  if (bad) throw new Error(`[fix:changed] refusing an unusual path: ${JSON.stringify(bad)}`);
  let status = 0;
  if (lint.length) status ||= run("pnpm", ["exec", "eslint", "--fix", "--max-warnings=0", ...lint]);
  if (format.length)
    status ||= run("pnpm", ["exec", "prettier", "--write", "--log-level", "warn", ...format]);
  console.warn(
    `[fix:changed] ${String(lint.length)} linted, ${String(format.length)} formatted${status ? " — errors remain" : ""}`,
  );
  process.exitCode = status;
}

if (isDirectRun(import.meta.url)) main();
