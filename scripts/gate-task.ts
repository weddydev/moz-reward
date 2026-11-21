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
import { startLinuxBrowsers } from "./e2e-linux";
import {
  commandStep,
  exec,
  GATE_DIR,
  parsePlaywrightReport,
  runSteps,
  STEP_LIMITS,
  summarise,
  timeoutNote,
  treeState,
  treeStep,
  vitestStep,
  type StepResult,
} from "./lib/gate";
import { writeStamp, workingTreeHash } from "./lib/gate-stamp";
import { isDirectRun } from "../src/lib/is-direct-run";

// Phase tasks (P1-10), design-phase tasks (PD-01, phase PD), security items (S-03), journeys (J2).
const TASK_ID = /\b((?:P\d|PD|S)-\d{2}|J\d{1,2})\b/g;

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
  return /^- \[ \] ((?:P\d|PD|S)-\d{2})\b/m.exec(phasesMd)?.[1] ?? null;
}

export function resolveTaskIds(
  args: string[],
  unpushedMessages: string,
  phasesMd: string,
): { ids: string[]; source: string } {
  const fromArgs = args.filter((a) => /^((?:P\d|PD|S)-\d{2}|J\d{1,2})$/.test(a));
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

export function unpushedCommitMessages(): string {
  const r = spawnSync("git", ["log", "--format=%B", "@{upstream}..HEAD"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
}

/**
 * The gate's Chromium E2E runs in the Linux Playwright container (`pnpm e2e:linux`), so a local pass means what
 * CI's pass means. Process audit 21 Nov: 11 of 18 red CI runs in a week were Linux-only E2E failures that a
 * host-OS gate could not see; all of them were Chromium (push CI runs only pixel7 + desktop1440).
 * WebKit runs on the host's WebKit instead (DECISIONS 21 Nov): Linux WebKit inside the laptop's Docker VM
 * renders ~1 frame/s for 1–2 s after a load, so timing specs fail there deterministically, while the same
 * specs pass on the host's WebKit and on CI's Linux WebKit (twice-weekly run).
 */
export const GATE_LINUX_PROJECTS = ["chromium", "pixel7", "desktop1440"] as const;
export const GATE_HOST_PROJECTS = ["webkit", "iphone14"] as const;
export const GATE_E2E_PROJECTS = [...GATE_LINUX_PROJECTS, ...GATE_HOST_PROJECTS] as const;

type Projects = readonly string[];
const projectArgs = (projects: Projects): string[] => projects.flatMap((p) => ["--project", p]);

export const taskE2eArgs = (ids: string[], projects: Projects): string[] => [
  ...projectArgs(projects),
  "--grep",
  grepFor(ids),
  "--pass-with-no-tests",
];

/**
 * Specs whose own files or test-side imports (fixtures, helpers) changed since main. Playwright can't see app
 * code a spec only reaches through the server, so a changed page still relies on the task specs and the
 * every-page rule (full 5-project run).
 */
export const CI_E2E_PROJECTS = ["pixel7", "desktop1440"] as const; // .github/workflows/ci.yml, every push

export const affectedE2eArgs = (): string[] => [
  // CI's projects only: all five over every changed spec overloads a laptop's container (21 Nov: 231 tests,
  // WebKit timeouts), and these specs are not the task's own.
  ...CI_E2E_PROJECTS.flatMap((p) => ["--project", p]),
  "--only-changed=origin/main",
  "--pass-with-no-tests",
];

/** The task's perf-budget specs alone, one worker (playwright.config: @perf runs only with PERF=1). */
export const perfE2eArgs = (ids: string[], projects: Projects): string[] => [
  ...projectArgs(projects),
  "--grep",
  ids.length > 0 ? `^(?=.*${grepFor(ids)})(?=.*@perf)` : "@perf",
  "--workers",
  "1",
  "--pass-with-no-tests",
];

/** Runs an E2E step with the browsers in the Linux container; a container that won't start fails the step. */
function linuxE2eStep(name: string, args: string[], env: Record<string, string> = {}): StepResult {
  const lx = startLinuxBrowsers();
  if ("error" in lx) return { name, status: "fail", seconds: 0, note: lx.error };
  try {
    return e2eStep(name, args, { ...env, PW_WS_ENDPOINT: lx.endpoint });
  } finally {
    lx.stop();
  }
}

/** `timeoutMin`: the step's limit (STEP_LIMITS); the task's own specs take minutes, the 5-project run longer. */
export function e2eStep(
  name: string,
  args: string[],
  env: Record<string, string> = {},
  timeoutMin: number = STEP_LIMITS.e2eTask,
): StepResult {
  const report = path.join(GATE_DIR, `${name.replace(/\W+/g, "-")}.json`);
  rmSync(report, { force: true });
  const r = exec(name, process.execPath, [PLAYWRIGHT_CLI, "test", ...args, "--reporter=json"], {
    env: { ...process.env, ...env, E2E_MODE: "prod", PLAYWRIGHT_JSON_OUTPUT_NAME: report },
    timeoutMin,
  });
  const counts = parsePlaywrightReport(report);
  const ok = r.ok && counts !== null && counts.failed === 0 && counts.flaky === 0;
  const note = r.timedOut
    ? timeoutNote(r)
    : !counts
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
  const testedTree = workingTreeHash();
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
    {
      name: "test-int",
      run: () => vitestStep("test-int", ["--project", "integration"], STEP_LIMITS.integration),
    },
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
    // ShellCheck on the root scripts for the VPS (P0-15), as in CI.
    { name: "lint:sh", run: () => commandStep("lint:sh", "pnpm", ["lint:sh"]) },
  );
  if (ids.length > 0) {
    const task = ids.join(",");
    steps.push(
      {
        name: `e2e ${task} (Linux Chromium)`,
        run: () =>
          linuxE2eStep(`e2e ${task} (Linux Chromium)`, taskE2eArgs(ids, GATE_LINUX_PROJECTS)),
      },
      {
        name: `e2e ${task} (host WebKit)`,
        run: () => e2eStep(`e2e ${task} (host WebKit)`, taskE2eArgs(ids, GATE_HOST_PROJECTS)),
      },
      {
        name: `e2e perf ${task} (Linux Chromium, 1 worker)`,
        run: () =>
          linuxE2eStep(
            `e2e perf ${task} (Linux Chromium, 1 worker)`,
            perfE2eArgs(ids, GATE_LINUX_PROJECTS),
            { PERF: "1" },
          ),
      },
      {
        name: `e2e perf ${task} (host WebKit, 1 worker)`,
        run: () =>
          e2eStep(
            `e2e perf ${task} (host WebKit, 1 worker)`,
            perfE2eArgs(ids, GATE_HOST_PROJECTS),
            {
              PERF: "1",
            },
          ),
      },
    );
    steps.push({
      name: "e2e changed specs (Linux)",
      run: () => linuxE2eStep("e2e changed specs (Linux)", affectedE2eArgs()),
    });
    // Molten parity (PD-01): a PD task also runs its parity specs ([PD-nn] titles), both browsers.
    const pd = ids.filter((id) => id.startsWith("PD-"));
    if (pd.length > 0) {
      steps.push({
        name: `parity ${pd.join(",")}`,
        run: () =>
          e2eStep(
            `parity ${pd.join(",")}`,
            [
              "--project",
              "parity-chromium",
              "--project",
              "parity-webkit",
              "--grep",
              grepFor(pd),
              "--pass-with-no-tests",
            ],
            { PARITY: "1" },
          ),
      });
    }
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
  const tree = treeStep(before);
  results.push(tree);
  const code = summarise("gate:task", results, skipped);
  // Pass stamp for the exact content tested, so the pre-push hook needn't run the same gate again.
  if (code === 0 && tree.status === "pass" && testedTree && ids.length > 0)
    writeStamp(testedTree, ids);
  process.exit(code);
}

if (isDirectRun(import.meta.url)) main();
