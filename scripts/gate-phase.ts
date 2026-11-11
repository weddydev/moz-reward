/**
 * `pnpm gate:phase` — the one heavy gate (TESTING §4, P0-14). Runs LOCALLY (no Actions minutes).
 * Every step either runs, or — when it applies to this phase but its tooling or target doesn't exist yet —
 * reports NOT VERIFIED, which fails the gate: no gate is ever "pending". Steps that only start in a later
 * phase (e.g. Lighthouse from P1) are listed as "from Pn" and don't count.
 * Unlike gate:task it does not stop at the first failure: a phase gate reports everything at once.
 * The demo (§8.7) and the developer's `pnpm backup:verify` (H-29) are run by /phase-complete, not here.
 * Env: STAGING_URL (+ STAGING_BASIC_AUTH_USER/PASSWORD) for the staging steps.
 */
import "./load-env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { E2E_DIST_DIR, ensureProductionBuild } from "./e2e";
import { checkParts, e2eStep, nextUntickedTask } from "./gate-task";
import {
  commandStep,
  exec,
  firstError,
  summarise,
  treeState,
  treeStep,
  vitestStep,
  type StepResult,
} from "./lib/gate";
import { isDirectRun } from "../src/lib/is-direct-run";

export type PhaseStep = {
  name: string;
  /** First phase the step applies to (P0 = always). */
  from: number;
  /** Why it can't run yet (tooling not built / no target); null when it can run. */
  missing: () => string | null;
  run: () => StepResult;
};

export const phaseNumber = (id: string | null): number => Number(/^P(\d)/.exec(id ?? "")?.[1] ?? 9);

const staging = (): string | null =>
  process.env.STAGING_URL ? null : "needs STAGING_URL (staging exists from P0-15)";
const notBuilt = (task: string) => (): string => `tooling not built yet (${task})`;

/** Runs or reports each step; never stops early. */
export function runPhaseSteps(steps: PhaseStep[], phase: number): StepResult[] {
  const results: StepResult[] = [];
  for (const s of steps) {
    if (s.from > phase) {
      continue; // listed in the summary footer instead
    }
    const missing = s.missing();
    if (missing) {
      results.push({ name: s.name, status: "not-verified", seconds: 0, note: missing });
      continue;
    }
    console.warn(`[gate:phase] ${s.name}…`);
    results.push(s.run());
  }
  return results;
}

function steps(checkScript: string): PhaseStep[] {
  const always = (): null => null;
  const list: PhaseStep[] = checkParts(checkScript).map((script) => ({
    name: script,
    from: 0,
    missing: always,
    run: () =>
      script === "test:unit"
        ? vitestStep("test-unit", ["--project", "unit"])
        : commandStep(script, "pnpm", [script]),
  }));
  list.push(
    {
      name: "test-int",
      from: 0,
      missing: always,
      run: () => vitestStep("test-int", ["--project", "integration"]),
    },
    {
      name: "coverage thresholds",
      from: 0,
      missing: always,
      run: () => commandStep("coverage thresholds", "pnpm", ["test:coverage"]),
    },
    {
      name: "test:titles --strict",
      from: 0,
      missing: always,
      run: () => commandStep("test:titles --strict", "pnpm", ["test:titles", "--strict"]),
    },
    {
      name: "production build",
      from: 0,
      missing: always,
      run: () => {
        const b = ensureProductionBuild();
        return { name: "production build", status: b.ok ? "pass" : "fail", seconds: b.seconds };
      },
    },
    {
      name: "check:bundle",
      from: 0,
      missing: always,
      run: () => commandStep("check:bundle", "pnpm", ["check:bundle", E2E_DIST_DIR]),
    },
    {
      // Includes the console/network/axe guard, axe on every route and the visual snapshots.
      name: "e2e (5 projects)",
      from: 0,
      missing: always,
      run: () => e2eStep("e2e (5 projects)", []),
    },
    {
      name: "mutation (rules modules)",
      from: 0,
      missing: always,
      run: () => commandStep("mutation (rules modules)", "pnpm", ["test:mutation"]),
    },
    {
      name: "live providers (require all)",
      from: 0,
      missing: always,
      run: () => requireAll(vitestStep("live-providers", ["--config", "vitest.live.config.mts"])),
    },
    {
      name: "k6 smoke (staging)",
      from: 0,
      missing: staging,
      run: () => {
        const r = exec("k6 smoke (staging)", "pnpm", ["test:load:smoke"], {
          env: { ...process.env, BASE_URL: process.env.STAGING_URL },
        });
        return {
          name: "k6 smoke (staging)",
          status: r.ok ? "pass" : "fail",
          seconds: r.seconds,
          ...(r.ok ? {} : { note: firstError(r.output) }),
        };
      },
    },
    { name: "ZAP baseline (staging)", from: 0, missing: notBuilt("P0-15"), run: unreachable },
    { name: "reconciliation clean", from: 0, missing: notBuilt("P0-18"), run: unreachable },
    { name: "Lighthouse CI", from: 1, missing: notBuilt("P1"), run: unreachable },
    { name: "rollback rehearsal (staging)", from: 1, missing: notBuilt("P1"), run: unreachable },
  );
  return list;
}

/** Phase gate rule (TESTING §7): a live provider skipped for missing keys is NOT VERIFIED, never a pass. */
export function requireAll(r: StepResult): StepResult {
  if (r.status !== "pass" || !r.counts || r.counts.skipped === 0) return r;
  return {
    ...r,
    status: "not-verified",
    note: `${r.counts.skipped} provider check(s) skipped for missing keys`,
  };
}

function unreachable(): StepResult {
  throw new Error("a step reported as missing was run");
}

function main(): void {
  // The phase gate's E2E run includes the visual snapshots (TESTING §4); see playwright.config grepInvert.
  process.env.VISUAL = "1";
  const before = treeState();
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const current = nextUntickedTask(readFileSync(path.join("docs", "PHASES.md"), "utf8"));
  const phase = phaseNumber(current);
  console.warn(`[gate:phase] phase P${phase} (next unticked task ${current ?? "none"})`);
  const all = steps(pkg.scripts.check ?? "");
  const results = runPhaseSteps(all, phase);
  results.push(treeStep(before));
  const later = all.filter((s) => s.from > phase).map((s) => `${s.name} (from P${s.from})`);
  if (later.length > 0) console.warn(`[gate:phase] not applicable yet: ${later.join("; ")}`);
  process.exit(summarise("gate:phase", results));
}

if (isDirectRun(import.meta.url)) main();
