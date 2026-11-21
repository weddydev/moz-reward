import { describe, expect, it } from "vitest";
import { affectedE2eArgs, GATE_E2E_PROJECTS, perfE2eArgs, taskE2eArgs } from "./gate-task";

describe("[P0-14] gate:task E2E runs where CI runs it (process audit, 21 Nov)", () => {
  it("[P0-14] the task's specs run on all five projects, CI's pixel7 + desktop1440 among them", () => {
    expect(GATE_E2E_PROJECTS).toEqual(["chromium", "webkit", "pixel7", "iphone14", "desktop1440"]);
    const args = taskE2eArgs(["PD-03"]);
    for (const p of GATE_E2E_PROJECTS) expect(args.join(" ")).toContain(`--project ${p}`);
    expect(args).toContain("--grep");
    expect(args).toContain("--pass-with-no-tests");
  });

  it("[P0-14] specs whose test-side files changed since main also run (Playwright --only-changed)", () => {
    const args = affectedE2eArgs();
    expect(args).toContain("--only-changed=origin/main");
    expect(args.filter((a) => a !== "--project" && !a.startsWith("--"))).toEqual([
      "pixel7",
      "desktop1440",
    ]);
    expect(args).not.toContain("--grep");
    expect(args).toContain("--pass-with-no-tests");
  });
});

describe("[P0-14] perf-budget specs run alone, one worker (process audit, 21 Nov)", () => {
  it("[P0-14] only the task's @perf specs, on one worker", () => {
    const args = perfE2eArgs(["PD-03"]);
    const grep = new RegExp(args[args.indexOf("--grep") + 1] ?? "");
    expect(grep.test("[PD-03] 200-burst stress at 4× CPU @perf")).toBe(true);
    expect(grep.test("[PD-03] the loop sleeps once idle")).toBe(false);
    expect(grep.test("[P1-08] the pour holds 60 fps @perf")).toBe(false);
    expect(args.slice(args.indexOf("--workers"), args.indexOf("--workers") + 2)).toEqual([
      "--workers",
      "1",
    ]);
  });
});
