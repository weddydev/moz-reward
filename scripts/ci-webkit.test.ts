import { describe, expect, it } from "vitest";
import {
  ciWebkitRuns,
  EVERY_PAGE_GLOBS,
  touchesEveryPage,
  taskIdsIn,
  webkitBase,
} from "./ci-webkit";

const ZERO = "0".repeat(40);
const projectsIn = (args: string[]): string[] =>
  args.flatMap((a, i) => (args[i - 1] === "--project" ? [a] : []));

describe("[P0-14] CI runs the task's and the changed specs on WebKit for every push (DECISIONS 22 Nov)", () => {
  it("[P0-14] task IDs come from the pushed commits' messages, each once", () => {
    expect(
      taskIdsIn("test(PD-03): x\n\nfix(PD-03): y (P0-17)\nchore(progress): handoff\nJ2"),
    ).toEqual(["PD-03", "P0-17", "J2"]);
    expect(taskIdsIn("chore(progress): baton")).toEqual([]);
  });

  it("[P0-14] on main the base is the previous main; elsewhere (or a new branch) the fork point from main", () => {
    expect(webkitBase({ ref: "refs/heads/main", before: "a".repeat(40) }, () => "m")).toBe(
      "a".repeat(40),
    );
    expect(webkitBase({ ref: "refs/heads/main", before: ZERO }, () => "m")).toBe("m");
    expect(webkitBase({ ref: "refs/heads/wip/PD-04", before: "a".repeat(40) }, () => "m")).toBe(
      "m",
    );
    expect(webkitBase({ ref: "refs/heads/wip/PD-04", before: "" }, () => "m")).toBe("m");
  });

  it("[P0-14] two runs, both on webkit + iphone14 (flakes confirmed afterwards): the task's tagged specs, then the changed specs", () => {
    const runs = ciWebkitRuns(["PD-03", "P0-17"], "abc123");
    expect(runs).toHaveLength(2);
    for (const r of runs) {
      expect(projectsIn(r)).toEqual(["webkit", "iphone14"]);
      // A flaky test is confirmed by `e2e:confirm-flakes` (re-run alone 5×), not failed outright.
      expect(r).not.toContain("--fail-on-flaky-tests");
      expect(r).toContain("--pass-with-no-tests");
    }
    const grep = new RegExp(runs[0]?.[runs[0].indexOf("--grep") + 1] ?? "");
    expect(grep.test("[PD-03] press kit")).toBe(true);
    expect(grep.test("[P0-17] test API")).toBe(true);
    expect(grep.test("[P1-08] pour")).toBe(false);
    expect(runs[1]).toContain("--only-changed=abc123");
    expect(runs[1]).not.toContain("--grep");
  });

  it("[P0-14] no task IDs in the push: only the changed specs run", () => {
    const runs = ciWebkitRuns([], "abc123");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toContain("--only-changed=abc123");
  });

  it("[P0-14] a change that affects every page (root layout, global CSS, proxy, E2E fixtures) runs every spec on WebKit (PD-A close review HIGH)", () => {
    for (const f of [
      "src/app/layout.tsx",
      "src/app/globals.css",
      "src/styles/molten.css",
      "src/proxy.ts",
      "next.config.ts",
      "tests/e2e/support/test.ts",
      "playwright.config.ts",
    ])
      expect(touchesEveryPage([f]), f).toBe(true);
    expect(touchesEveryPage(["src/components/ui/button.tsx", "docs/TESTING.md"])).toBe(false);
    expect(EVERY_PAGE_GLOBS.length).toBeGreaterThan(0);
    const runs = ciWebkitRuns(["PD-03"], "abc123", true);
    expect(runs).toHaveLength(1);
    expect(projectsIn(runs[0] ?? [])).toEqual(["webkit", "iphone14"]);
    expect(runs[0]).not.toContain("--grep");
    expect(runs[0]?.some((a) => a.startsWith("--only-changed"))).toBe(false);
  });
});
