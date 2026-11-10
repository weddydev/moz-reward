/**
 * `pnpm gate:task [TASK-ID…]` — the task gate (TESTING §4, P0-14):
 *   1. every part of `pnpm check` (read from package.json, so the two never drift), unit tests counted;
 *   2. `pnpm test:int` (integration + authz matrix);
 *   3. the production build — the same `.next-e2e` build `pnpm e2e` serves (one build, not two) — and
 *      `check:bundle` on it; then `pnpm sast` (Semgrep, scripts/sast.ts: the same command CI runs);
 *   4. E2E specs tagged with the task ID(s), on that build, Chromium + WebKit (flaky = failure);
 *   5. the working tree is exactly as before.
 * Task IDs: arguments, else the IDs in the commits not yet pushed, else the next unticked task in PHASES.md.
 * Needs `pnpm services:up`. Exit 0 only if every step passed.
 */
import "./load-env";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { E2E_DIST_DIR, ensureProductionBuild, PLAYWRIGHT_CLI } from "./e2e";
import {
  commandStep,
  exec,
  GATE_DIR,
  parsePlaywrightReport,
  runSteps,
  summarise,
  treeState,
  treeStep,
  vitestStep,
  type StepResult,
} from "./lib/gate";
import { isDirectRun } from "../src/lib/is-direct-run";

const TASK_ID = /\b((?:P\d|S)-\d{2}|J\d{1,2})\b/g;

/** Splits the `check` script ("pnpm a && pnpm b …") into its pnpm script names. */
export function checkParts(checkScript: string): string[] {
  return checkScript.split("&&").map((part) => {
    const m = /^\s*pnpm (?:run )?([\w:-]+)\s*$/.exec(part);
    if (!m?.[1]) throw new Error(`gate:task can't mirror check part "${part.trim()}"`);
    return m[1];
  });
}

/** The first unticked task line in PHASES.md (`- [ ] P0-14 · …`). */
export function nextUntickedTask(phasesMd: string): string | null {
  return /^- \[ \] ((?:P\d|S)-\d{2})\b/m.exec(phasesMd)?.[1] ?? null;
}

export function resolveTaskIds(
  args: string[],
  unpushedMessages: string,
  phasesMd: string,
): { ids: string[]; source: string } {
  const fromArgs = args.filter((a) => /^((?:P\d|S)-\d{2}|J\d{1,2})$/.test(a));
  if (fromArgs.length > 0) return { ids: fromArgs, source: "arguments" };
  const fromCommits = [...new Set([...unpushedMessages.matchAll(TASK_ID)].map((m) => m[1] ?? ""))];
  if (fromCommits.length > 0) return { ids: fromCommits, source: "unpushed commits" };
  const next = nextUntickedTask(phasesMd);
  return next
    ? { ids: [next], source: "next unticked task in PHASES.md" }
    : { ids: [], source: "none" };
}

/** Playwright `--grep` for any of the IDs as a title tag: `[P0-14]`. */
export const grepFor = (ids: string[]): string =>
  `\\[(${ids.map((id) => id.replace(/[-]/g, "\\-")).join("|")})\\]`;

function unpushedCommitMessages(): string {
  const r = spawnSync("git", ["log", "--format=%B", "@{upstream}..HEAD"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
}

export function e2eStep(name: string, args: string[]): StepResult {
  const report = path.join(GATE_DIR, `${name.replace(/\W+/g, "-")}.json`);
  rmSync(report, { force: true });
  const r = exec(name, process.execPath, [PLAYWRIGHT_CLI, "test", ...args, "--reporter=json"], {
    env: { ...process.env, E2E_MODE: "prod", PLAYWRIGHT_JSON_OUTPUT_NAME: report },
  });
  const counts = parsePlaywrightReport(report);
  const ok = r.ok && counts !== null && counts.failed === 0 && counts.flaky === 0;
  const note = !counts
    ? "no Playwright report (server failed to start?)"
    : counts.flaky > 0
      ? `${counts.flaky} flaky (counts as a failure, TESTING §7)`
      : counts.failed > 0
        ? `${counts.failed} failed`
        : counts.passed === 0
          ? "no specs carry this tag (none needed for this task?)"
          : undefined;
  return {
    name,
    status: ok ? "pass" : "fail",
    seconds: r.seconds,
    ...(counts ? { counts } : {}),
    ...(note ? { note } : {}),
  };
}

function main(): void {
  const before = treeState();
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const checkScript = pkg.scripts.check;
  if (!checkScript) throw new Error("package.json has no check script");
  const { ids, source } = resolveTaskIds(
    process.argv.slice(2),
    unpushedCommitMessages(),
    readFileSync(path.join("docs", "PHASES.md"), "utf8"),
  );
  console.warn(`[gate:task] task ${ids.join(", ") || "(none)"} — from ${source}`);

  const steps: Array<{ name: string; run: () => StepResult }> = checkParts(checkScript).map(
    (script) => ({
      name: script,
      run: () =>
        script === "test:unit"
          ? vitestStep("test-unit", ["--project", "unit"])
          : commandStep(script, "pnpm", [script]),
    }),
  );
  steps.push(
    { name: "test-int", run: () => vitestStep("test-int", ["--project", "integration"]) },
    {
      name: "production build",
      run: () => {
        const b = ensureProductionBuild();
        return {
          name: "production build",
          status: b.ok ? "pass" : "fail",
          seconds: b.seconds,
          note: b.ok
            ? b.reused
              ? "reused (sources unchanged)"
              : E2E_DIST_DIR
            : "see .artifacts/e2e/build.log",
        };
      },
    },
    {
      name: "check:bundle",
      run: () => commandStep("check:bundle", "pnpm", ["check:bundle", E2E_DIST_DIR]),
    },
    // Semgrep, as in CI (P0-18: a CI-only check let a finding through).
    { name: "sast", run: () => commandStep("sast", "pnpm", ["sast"]) },
  );
  if (ids.length > 0) {
    steps.push({
      name: `e2e ${ids.join(",")}`,
      run: () =>
        e2eStep(`e2e ${ids.join(",")}`, [
          "--project",
          "chromium",
          "--project",
          "webkit",
          "--grep",
          grepFor(ids),
          "--pass-with-no-tests",
        ]),
    });
  } else {
    steps.push({
      name: "e2e (task)",
      run: () => ({
        name: "e2e (task)",
        status: "fail",
        seconds: 0,
        note: "no task ID: pass one (pnpm gate:task P0-14)",
      }),
    });
  }

  const { results, skipped } = runSteps(steps);
  results.push(treeStep(before));
  process.exit(summarise("gate:task", results, skipped));
}

if (isDirectRun(import.meta.url)) main();
