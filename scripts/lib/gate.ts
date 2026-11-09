/**
 * Shared runner for `pnpm gate:task` / `pnpm gate:phase` (P0-14, TESTING §4). Each step's full output goes to
 * `.artifacts/gate/<step>.log`; the console gets one line per step and, on failure, the log's last lines.
 * Steps run in order and stop at the first failure (a later suite on a broken base only adds noise).
 */
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Counts = { passed: number; failed: number; skipped: number; flaky: number };

export type StepResult = {
  name: string;
  status: "pass" | "fail" | "not-verified";
  seconds: number;
  /** Test counts when the step is a test suite. */
  counts?: Counts;
  /** One short line: why it failed, why it is not verified, or what it covered. */
  note?: string;
};

export const GATE_DIR = path.join(".artifacts", "gate");
const shell = process.platform === "win32";
const text = (v: unknown): string => (typeof v === "string" ? v : "");

export const logPath = (name: string): string =>
  path.join(GATE_DIR, `${name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.log`);

/**
 * `pnpm` needs a shell on Windows (pnpm.cmd), and a shell re-parses its arguments. Every argument the gate passes
 * is a script name, flag or path, so anything else is refused rather than handed to cmd.exe.
 */
export function assertShellSafe(args: readonly string[]): void {
  const bad = args.find((a) => !/^[\w:.=@\\/-]+$/.test(a));
  if (bad !== undefined)
    throw new Error(`[gate] refusing a shell argument: ${JSON.stringify(bad)}`);
}

/**
 * The gate loads `.env.local` (scripts/load-env), which sets NODE_ENV=development for `pnpm dev`. Children must
 * not inherit it: Vitest only defaults NODE_ENV to "test" when unset, and next build/start set "production"
 * themselves. (Found when the gate's integration run saw NODE_ENV=development.)
 */
export function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy: NodeJS.ProcessEnv = { ...env };
  Reflect.deleteProperty(copy, "NODE_ENV");
  return copy;
}

export function exec(
  name: string,
  cmd: string,
  args: string[],
  opts: SpawnSyncOptions = {},
): { ok: boolean; output: string; seconds: number } {
  mkdirSync(GATE_DIR, { recursive: true });
  const useShell = cmd === "pnpm" && shell;
  if (useShell) assertShellSafe(args);
  const started = Date.now();
  // Shell only for pnpm.cmd on Windows, with arguments checked by assertShellSafe above.
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    shell: useShell,
    ...opts,
    env: childEnv(opts.env ?? process.env),
  });
  // stdout/stderr are null when the process could not be spawned, whatever the types say.
  const output = `${text(r.stdout)}\n${text(r.stderr)}${r.error ? `\n${r.error.message}` : ""}`;
  writeFileSync(logPath(name), output);
  return { ok: r.status === 0, output, seconds: Math.round((Date.now() - started) / 1000) };
}

export const tail = (text: string, lines = 25): string =>
  text.trim().split("\n").slice(-lines).join("\n");

/** A plain command step (pass/fail on exit code). */
export function commandStep(name: string, cmd: string, args: string[], note?: string): StepResult {
  const r = exec(name, cmd, args);
  return {
    name,
    status: r.ok ? "pass" : "fail",
    seconds: r.seconds,
    ...(r.ok ? (note ? { note } : {}) : { note: firstError(r.output) }),
  };
}

/** Best one-line reason from a failed command's output. */
export function firstError(output: string): string {
  const line = output
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /error|fail|✘|×|not found|refus/i.test(l) && !/^\s*$/.test(l));
  return (line ?? tail(output, 1)).slice(0, 200);
}

/** Vitest run with a JSON report → counts. */
export function vitestStep(name: string, args: string[]): StepResult {
  const report = path.join(GATE_DIR, `${name}.json`);
  rmSync(report, { force: true });
  const r = exec(name, "pnpm", [
    "exec",
    "vitest",
    "run",
    ...args,
    "--reporter=dot",
    "--reporter=json",
    `--outputFile.json=${report}`,
  ]);
  const counts = parseVitestReport(report);
  const ok = r.ok && counts !== null && counts.failed === 0;
  return {
    name,
    status: ok ? "pass" : "fail",
    seconds: r.seconds,
    ...(counts ? { counts } : {}),
    ...(ok ? {} : { note: counts ? `${counts.failed} failed` : firstError(r.output) }),
  };
}

export function parseVitestReport(file: string): Counts | null {
  if (!existsSync(file)) return null;
  try {
    const j = JSON.parse(readFileSync(file, "utf8")) as {
      numPassedTests: number;
      numFailedTests: number;
      numPendingTests: number;
      numTodoTests: number;
    };
    return {
      passed: j.numPassedTests,
      failed: j.numFailedTests,
      skipped: j.numPendingTests + j.numTodoTests,
      flaky: 0,
    };
  } catch {
    return null;
  }
}

/** Playwright JSON report → counts. Flaky tests count as failures (TESTING §7). */
export function parsePlaywrightReport(file: string): Counts | null {
  if (!existsSync(file)) return null;
  try {
    const j = JSON.parse(readFileSync(file, "utf8")) as {
      stats: { expected: number; unexpected: number; flaky: number; skipped: number };
    };
    return {
      passed: j.stats.expected,
      failed: j.stats.unexpected,
      skipped: j.stats.skipped,
      flaky: j.stats.flaky,
    };
  } catch {
    return null;
  }
}

/** `git status --porcelain` (untracked included): a gate must leave the working tree exactly as it found it. */
export function treeState(): string {
  const r = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    encoding: "utf8",
  });
  return r.stdout;
}

export function treeStep(before: string): StepResult {
  const after = treeState();
  if (after === before) return { name: "working tree unchanged", status: "pass", seconds: 0 };
  const changed = after
    .split("\n")
    .filter((l) => l && !before.includes(l))
    .slice(0, 5)
    .map((l) => l.slice(3))
    .join(", ");
  return {
    name: "working tree unchanged",
    status: "fail",
    seconds: 0,
    note: `the gate changed: ${changed}`,
  };
}

const pad = (s: string | number, n: number): string => String(s).padEnd(n);

/** Prints the compact summary and returns the exit code (0 only if every step passed). */
export function summarise(title: string, results: StepResult[], skipped: string[] = []): number {
  const width = Math.max(26, ...results.map((r) => r.name.length + 2));
  const lines = [
    "",
    `[${title}] ${new Date().toISOString()}`,
    `${pad("step", width)}${pad("result", 14)}${pad("time", 7)}tests (pass/fail/skip/flaky)`,
  ];
  for (const r of results) {
    const c = r.counts
      ? `${r.counts.passed}/${r.counts.failed}/${r.counts.skipped}/${r.counts.flaky}`
      : "";
    const label = r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "NOT VERIFIED";
    lines.push(`${pad(r.name, width)}${pad(label, 14)}${pad(`${r.seconds}s`, 7)}${c}`);
    if (r.note) lines.push(`${pad("", width)}  ↳ ${r.note}`);
  }
  for (const s of skipped)
    lines.push(`${pad(s, width)}${pad("not run", 14)}(an earlier step failed)`);
  const ok = results.every((r) => r.status === "pass") && skipped.length === 0;
  lines.push(`[${title}] ${ok ? "PASS" : "FAIL"} — logs in ${GATE_DIR}/`);
  console.warn(lines.join("\n"));
  return ok ? 0 : 1;
}

/** Runs steps in order; after the first failure the rest are listed as not run. */
export function runSteps(steps: Array<{ name: string; run: () => StepResult }>): {
  results: StepResult[];
  skipped: string[];
} {
  const results: StepResult[] = [];
  const skipped: string[] = [];
  for (const step of steps) {
    if (results.some((r) => r.status === "fail")) {
      skipped.push(step.name);
      continue;
    }
    console.warn(`[gate] ${step.name}…`);
    const r = step.run();
    results.push(r);
    if (r.status === "fail") {
      const log = logPath(r.name);
      if (existsSync(log)) console.warn(tail(readFileSync(log, "utf8")));
    }
  }
  return { results, skipped };
}
