/**
 * Self-tests for the gate scripts' failure paths (P0-14, TESTING §7: gates ship negative fixtures and are
 * shown failing). Pure parts only; the end-to-end runs are evidenced in SESSION_LOG.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { level, minutesFromBilling, minutesFromJobs } from "./ci-usage";
import { buildFingerprint } from "./e2e";
import { phaseNumber, requireAll, runPhaseSteps, type PhaseStep } from "./gate-phase";
import { checkParts, grepFor, nextUntickedTask, resolveTaskIds } from "./gate-task";
import {
  assertShellSafe,
  parsePlaywrightReport,
  parseVitestReport,
  runSteps,
  summarise,
  treeState,
  treeStep,
  type StepResult,
} from "./lib/gate";

const tmp = (name: string, body: string): string => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "gate-")), name);
  writeFileSync(file, body);
  return file;
};
const pass = (name: string): StepResult => ({ name, status: "pass", seconds: 0 });
const fail = (name: string): StepResult => ({ name, status: "fail", seconds: 0, note: "boom" });

describe("[P0-14] gate reports", () => {
  it("treats a missing or malformed test report as no result (the step then fails)", () => {
    expect(parseVitestReport(path.join(tmpdir(), "does-not-exist.json"))).toBeNull();
    expect(parseVitestReport(tmp("v.json", "{not json"))).toBeNull();
    expect(parsePlaywrightReport(tmp("p.json", "{}"))).toBeNull();
  });

  it("reads Vitest and Playwright counts, keeping flaky separate", () => {
    const v = tmp(
      "v.json",
      JSON.stringify({ numPassedTests: 9, numFailedTests: 1, numPendingTests: 2, numTodoTests: 1 }),
    );
    expect(parseVitestReport(v)).toEqual({ passed: 9, failed: 1, skipped: 3, flaky: 0 });
    const p = tmp(
      "p.json",
      JSON.stringify({ stats: { expected: 5, unexpected: 0, flaky: 1, skipped: 2 } }),
    );
    expect(parsePlaywrightReport(p)).toEqual({ passed: 5, failed: 0, skipped: 2, flaky: 1 });
  });
});

describe("[P0-14] gate runner", () => {
  it("stops at the first failing step and lists the rest as not run", () => {
    const third = vi.fn(() => pass("c"));
    const { results, skipped } = runSteps([
      { name: "a", run: () => pass("a") },
      { name: "b", run: () => fail("b") },
      { name: "c", run: third },
    ]);
    expect(results.map((r) => r.status)).toEqual(["pass", "fail"]);
    expect(skipped).toEqual(["c"]);
    expect(third).not.toHaveBeenCalled();
  });

  it("exits 1 on a failure, a NOT VERIFIED step or an unrun step; 0 only when all passed", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(summarise("t", [pass("a"), pass("b")])).toBe(0);
    expect(summarise("t", [pass("a"), fail("b")])).toBe(1);
    expect(summarise("t", [{ name: "x", status: "not-verified", seconds: 0 }])).toBe(1);
    expect(summarise("t", [pass("a")], ["b"])).toBe(1);
  });

  it("refuses shell metacharacters in arguments that would go through cmd.exe, and allows the gate's own", () => {
    expect(() => {
      assertShellSafe([
        "exec",
        "vitest",
        "--project=integration",
        String.raw`--outputFile.json=.artifacts\gate\int.json`,
        "check:bundle",
        "@scope/pkg",
      ]);
    }).not.toThrow();
    for (const bad of ["a & calc", "x|y", "$(id)", "a;b", "%PATH%", "a b", "^", "x>y", ""])
      expect(() => {
        assertShellSafe(["exec", bad]);
      }).toThrow(/refusing a shell argument/);
  });

  it("fails when the working tree changed during the gate", () => {
    const now = treeState();
    expect(treeStep(now).status).toBe("pass");
    expect(treeStep(`${now}?? stray-file-the-gate-left.txt\n`).status).toBe("fail");
  });
});

describe("[P0-14] gate:task inputs", () => {
  it("mirrors `pnpm check` part by part and refuses a part it can't mirror", () => {
    expect(
      checkParts("pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:unit"),
    ).toEqual(["typecheck", "lint", "format:check", "test:unit"]);
    expect(() => checkParts("pnpm typecheck && eslint .")).toThrow(/can't mirror/);
  });

  it("takes task IDs from arguments, then unpushed commits, then the next unticked task", () => {
    const phases = "- [x] P0-17 · Test infra\n- [ ] P0-14 · CI pipeline\n- [ ] P0-19 · Auth";
    expect(nextUntickedTask(phases)).toBe("P0-14");
    expect(resolveTaskIds(["P0-19"], "feat: x (P0-14)", phases)).toEqual({
      ids: ["P0-19"],
      source: "arguments",
    });
    expect(resolveTaskIds([], "feat(ci): gates (P0-14)\n\nfix: y [P0-19]", phases).ids).toEqual([
      "P0-14",
      "P0-19",
    ]);
    expect(resolveTaskIds([], "chore: tidy", phases)).toEqual({
      ids: ["P0-14"],
      source: "next unticked task in PHASES.md",
    });
    expect(resolveTaskIds([], "", "- [x] P0-01 · done").ids).toEqual([]);
  });

  it("greps only exact title tags", () => {
    const re = new RegExp(grepFor(["P0-14", "J2"]));
    expect(re.test("[P0-14] production parity › x")).toBe(true);
    expect(re.test("[J2] staff approves")).toBe(true);
    expect(re.test("[P0-140] other")).toBe(false);
    expect(re.test("P0-14 untagged")).toBe(false);
  });
});

describe("[P0-14] gate:phase", () => {
  const step = (name: string, from: number, missing: string | null): PhaseStep => ({
    name,
    from,
    missing: () => missing,
    run: () => pass(name),
  });

  it("reports a step whose tooling is missing as NOT VERIFIED, and skips steps from a later phase", () => {
    const results = runPhaseSteps(
      [step("ok", 0, null), step("zap", 0, "tooling not built yet"), step("lighthouse", 1, "P1")],
      0,
    );
    expect(results.map((r) => `${r.name}:${r.status}`)).toEqual(["ok:pass", "zap:not-verified"]);
    expect(phaseNumber("P1-03")).toBe(1);
  });

  it("never passes a live-provider run that skipped providers (missing keys = NOT VERIFIED)", () => {
    const counts = { passed: 1, failed: 0, skipped: 1, flaky: 0 };
    expect(requireAll({ ...pass("live"), counts }).status).toBe("not-verified");
    expect(requireAll({ ...pass("live"), counts: { ...counts, skipped: 0 } }).status).toBe("pass");
  });
});

describe("[P0-14] ci:usage", () => {
  it("counts only Actions minutes from the billing report", () => {
    expect(
      minutesFromBilling([
        { product: "actions", unitType: "Minutes", quantity: 120 },
        { product: "actions", unitType: "GigabyteHours", quantity: 9 },
        { product: "packages", unitType: "minutes", quantity: 50 },
        { product: "Actions", unitType: "minutes", quantity: 30 },
      ]),
    ).toBe(150);
  });

  it("rounds each finished job up to a whole minute and ignores unfinished jobs", () => {
    expect(
      minutesFromJobs([
        { started_at: "2026-11-09T10:00:00Z", completed_at: "2026-11-09T10:00:01Z" },
        { started_at: "2026-11-09T10:00:00Z", completed_at: "2026-11-09T10:02:00Z" },
        { started_at: "2026-11-09T10:00:00Z", completed_at: null },
      ]),
    ).toBe(3);
  });

  it("warns at 70% and pauses scheduled runs at 80%", () => {
    expect(level(1399, 2000)).toBe("ok");
    expect(level(1400, 2000)).toBe("warn");
    expect(level(1600, 2000)).toBe("pause");
  });
});

describe("[P0-14] e2e build reuse", () => {
  it("changes the build fingerprint when the E2E env changes (so a stale build is never reused)", () => {
    const a = buildFingerprint({ APP_ENV: "test" });
    expect(buildFingerprint({ APP_ENV: "test" })).toBe(a);
    expect(buildFingerprint({ APP_ENV: "staging" })).not.toBe(a);
  });
});

describe("[P0-14] gate child environment", () => {
  it("never passes NODE_ENV from .env.local to the suites it runs", async () => {
    const { childEnv } = await import("./lib/gate");
    const env = childEnv({
      NODE_ENV: "development",
      APP_ENV: "test",
    } as unknown as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBeUndefined();
    expect(env.APP_ENV).toBe("test");
  });
});
