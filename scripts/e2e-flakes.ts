/**
 * `pnpm e2e:confirm-flakes [report.json …]` (process fix 2, human 23 Nov 2026; DECISIONS "Process fixes
 * approved"). CI runs E2E with retries; a test that failed and then passed on retry ("flaky") used to fail the
 * whole run, so one shaky test anywhere blocked every task. Now each flaky test is re-run alone 5 times on the
 * same commit with no retries:
 * - any failure → the run stays red (it is a real, intermittent failure: fix it first, as before);
 * - 5/5 pass → a warning annotation and a job-summary line; the run goes green, and the test is logged in
 *   progress/FOLLOWUPS.md by the session that reads the result, to be fixed or quarantined before the
 *   sub-phase close (gate:phase and the nightly full run still require zero flaky tests).
 * Reads the Playwright JSON reports CI writes (`PW_JSON_OUT`, default `.artifacts/e2e/results*.json`).
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDirectRun } from "../src/lib/is-direct-run";

type PwTest = { projectName: string; status: string };
type PwSpec = { title: string; file: string; line: number; tests: PwTest[] };
type PwSuite = { title?: string; specs?: PwSpec[]; suites?: PwSuite[] };
export type PwReport = { suites?: PwSuite[] };
export type Flake = { file: string; line: number; title: string; project: string };

/** Times each flaky test is re-run alone to confirm it before the run may go green. */
export const CONFIRM_RUNS = 5;

export function flakyTests(report: PwReport): Flake[] {
  const out: Flake[] = [];
  const walk = (suites: PwSuite[] | undefined): void => {
    for (const s of suites ?? []) {
      for (const spec of s.specs ?? [])
        for (const t of spec.tests)
          if (t.status === "flaky")
            out.push({
              file: spec.file,
              line: spec.line,
              title: spec.title,
              project: t.projectName,
            });
      walk(s.suites);
    }
  };
  walk(report.suites);
  return out;
}

/** The `pnpm` arguments and extra env that re-run one flaky test alone, in the mode it ran in. */
export function confirmRunArgs(f: Flake): { args: string[]; env: Record<string, string> } {
  const parity = f.project.startsWith("parity-");
  const perf = f.title.includes("@perf");
  const fps = f.title.includes("@fps");
  const env: Record<string, string> = {
    ...(perf ? { PERF: "1" } : {}),
    ...(fps ? { FPS: "1" } : {}),
  };
  return {
    args: [
      "e2e",
      ...(parity ? ["--parity"] : []),
      `${f.file}:${String(f.line)}`,
      "--project",
      f.project,
      "--repeat-each",
      String(CONFIRM_RUNS),
      "--retries",
      "0",
      ...(perf || fps ? ["--workers", "1"] : []),
    ],
    env,
  };
}

function reportFiles(argv: string[]): string[] {
  if (argv.length > 0) return argv.filter((f) => existsSync(f));
  const dir = path.join(".artifacts", "e2e");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^results.*\.json$/.test(f))
    .map((f) => path.join(dir, f));
}

function main(): void {
  const flakes = reportFiles(process.argv.slice(2)).flatMap((f) =>
    flakyTests(JSON.parse(readFileSync(f, "utf8")) as PwReport),
  );
  if (flakes.length === 0) {
    console.warn("[e2e:confirm-flakes] no flaky tests");
    return;
  }
  const real: Flake[] = [];
  for (const f of flakes) {
    const { args, env } = confirmRunArgs(f);
    console.warn(
      `[e2e:confirm-flakes] ${f.title} [${f.project}]: re-running ${String(CONFIRM_RUNS)}× alone`,
    );
    const r = spawnSync("pnpm", args, {
      stdio: "inherit",
      // Its own report file, so the reports this script reads are never overwritten.
      env: { ...process.env, ...env, PW_JSON_OUT: path.join(".artifacts", "e2e", "confirm.json") },
    });
    if (r.status !== 0) real.push(f);
  }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  for (const f of flakes) {
    const where = `${f.file}:${String(f.line)} [${f.project}]`;
    if (real.includes(f))
      // GitHub reads workflow annotations from stdout.
      process.stdout.write(
        `::error file=${f.file},line=${String(f.line)}::Intermittent failure (failed again when re-run alone): ${f.title}\n`,
      );
    else
      process.stdout.write(
        `::warning file=${f.file},line=${String(f.line)}::Confirmed flake (passed ${String(CONFIRM_RUNS)}/${String(CONFIRM_RUNS)} alone): ${f.title}. Log it in FOLLOWUPS; fix or quarantine before the sub-phase close.\n`,
      );
    if (summary)
      appendFileSync(
        summary,
        `- ${real.includes(f) ? "**FAILED again alone**" : `flaky, passed ${String(CONFIRM_RUNS)}/${String(CONFIRM_RUNS)} alone`}: ${f.title} — ${where}\n`,
      );
  }
  if (real.length > 0) process.exit(1);
}

if (isDirectRun(import.meta.url)) main();
