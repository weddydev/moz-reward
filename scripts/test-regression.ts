/**
 * `pnpm test:regression` — full regression (TESTING §4): unit, integration, authz matrix and every E2E
 * spec on all Playwright projects, then a per-suite summary. Exit 1 if any suite fails.
 * Needs `pnpm services:up`. Reports go to .artifacts/regression/.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

type Counts = {
  suite: string;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  ok: boolean;
  seconds: number;
};

const OUT = path.join(".artifacts", "regression");
mkdirSync(OUT, { recursive: true });
const shell = process.platform === "win32";

function run(cmd: string, args: string[]): { status: number; seconds: number } {
  const started = Date.now();
  const r = spawnSync(cmd, args, { stdio: ["ignore", "inherit", "inherit"], shell });
  return { status: r.status ?? 1, seconds: Math.round((Date.now() - started) / 1000) };
}

function vitestSuite(suite: string, args: string[]): Counts {
  const file = path.join(OUT, `${suite}.json`);
  const r = run("pnpm", [
    "exec",
    "vitest",
    "run",
    ...args,
    "--reporter=dot",
    "--reporter=json",
    `--outputFile.json=${file}`,
  ]);
  try {
    const j = JSON.parse(readFileSync(file, "utf8")) as {
      numPassedTests: number;
      numFailedTests: number;
      numPendingTests: number;
      numTodoTests: number;
      success: boolean;
    };
    return {
      suite,
      passed: j.numPassedTests,
      failed: j.numFailedTests,
      skipped: j.numPendingTests + j.numTodoTests,
      flaky: 0,
      ok: r.status === 0 && j.success,
      seconds: r.seconds,
    };
  } catch {
    return { suite, passed: 0, failed: 0, skipped: 0, flaky: 0, ok: false, seconds: r.seconds };
  }
}

function e2eSuite(): Counts {
  const file = path.join(OUT, "e2e.json");
  const started = Date.now();
  const r = spawnSync("pnpm", ["exec", "playwright", "test", "--reporter=dot,json"], {
    stdio: ["ignore", "inherit", "inherit"],
    shell,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: file },
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  try {
    const j = JSON.parse(readFileSync(file, "utf8")) as {
      stats: { expected: number; unexpected: number; flaky: number; skipped: number };
    };
    return {
      suite: "e2e (5 projects)",
      passed: j.stats.expected,
      failed: j.stats.unexpected,
      skipped: j.stats.skipped,
      flaky: j.stats.flaky,
      ok: r.status === 0,
      seconds,
    };
  } catch {
    return {
      suite: "e2e (5 projects)",
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      ok: false,
      seconds,
    };
  }
}

const results: Counts[] = [
  vitestSuite("unit", ["--project", "unit"]),
  vitestSuite("integration", ["--project", "integration", "tests/integration"]),
  vitestSuite("authz", ["--project", "integration", "tests/authz"]),
  e2eSuite(),
];

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.warn(`\n[regression] ${new Date().toISOString()}`);
console.warn(
  `${pad("suite", 18)}${pad("passed", 8)}${pad("failed", 8)}${pad("skipped", 9)}${pad("flaky", 7)}${pad("time", 7)}result`,
);
for (const r of results) {
  console.warn(
    `${pad(r.suite, 18)}${pad(r.passed, 8)}${pad(r.failed, 8)}${pad(r.skipped, 9)}${pad(r.flaky, 7)}${pad(`${r.seconds}s`, 7)}${r.ok ? "PASS" : "FAIL"}`,
  );
}
const total = results.reduce((a, r) => a + r.passed, 0);
const allOk = results.every((r) => r.ok && r.flaky === 0);
console.warn(
  `${pad("total", 18)}${pad(total, 8)}${pad(
    results.reduce((a, r) => a + r.failed, 0),
    8,
  )}\n[regression] ${allOk ? "PASS" : "FAIL"} (flaky tests count as failures: TESTING §7)`,
);
process.exit(allOk ? 0 : 1);
