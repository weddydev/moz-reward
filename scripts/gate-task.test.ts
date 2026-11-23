import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CI_WEBKIT_PROJECTS,
  GATE_LINUX_PROJECTS,
  nativeWindowsWarning,
  perfE2eArgs,
  taskE2eArgs,
} from "./gate-task";

const projectsIn = (args: string[]): string[] =>
  args.flatMap((a, i) => (args[i - 1] === "--project" ? [a] : []));

describe("[P0-14] gate:task E2E runs where CI runs it (process change, 22 Nov)", () => {
  it("[P0-14] the task's specs run on the three Chromium projects, in the Linux container", () => {
    expect([...GATE_LINUX_PROJECTS]).toEqual(["chromium", "pixel7", "desktop1440"]);
    const args = taskE2eArgs(["PD-03"], GATE_LINUX_PROJECTS);
    expect(projectsIn(args)).toEqual(["chromium", "pixel7", "desktop1440"]);
    expect(args).toContain("--grep");
    expect(args).toContain("--pass-with-no-tests");
  });

  it("[P0-14] the WebKit projects run on CI for every push instead: together, all five projects every time", () => {
    // A laptop's WebKit is not evidence (Windows: DECISIONS 12 Nov; Linux in a laptop's Docker VM: ~1 frame/s
    // after a load, 21 Nov). CI's Linux WebKit is, and main only takes commits CI passed (DECISIONS 22 Nov).
    expect([...CI_WEBKIT_PROJECTS]).toEqual(["webkit", "iphone14"]);
    expect([...GATE_LINUX_PROJECTS, ...CI_WEBKIT_PROJECTS].sort()).toEqual(
      ["chromium", "desktop1440", "iphone14", "pixel7", "webkit"].sort(),
    );
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).toMatch(/pnpm e2e:ci-webkit/);
    // The WebKit job installs WebKit (parallel jobs since 23 Nov, process fix 1).
    expect(ci).toMatch(/playwright install --with-deps webkit/);
  });

  it("[P0-14] native Windows gets a pointer to WSL2, the one Windows setup whose results match CI", () => {
    expect(nativeWindowsWarning("win32")).toMatch(/WSL2/);
    expect(nativeWindowsWarning("linux")).toBeNull();
    expect(nativeWindowsWarning("darwin")).toBeNull();
  });
});

describe("[P0-14] perf-budget specs run alone, one worker (process audit, 21 Nov)", () => {
  it("[P0-14] only the task's @perf specs, on one worker", () => {
    const args = perfE2eArgs(["PD-03"], GATE_LINUX_PROJECTS);
    const grep = new RegExp(args[args.indexOf("--grep") + 1] ?? "");
    expect(grep.test("[PD-03] 200-burst stress at 4× CPU @perf")).toBe(true);
    expect(grep.test("[PD-03] the loop sleeps once idle")).toBe(false);
    expect(grep.test("[P1-08] the pour holds 60 fps @perf")).toBe(false);
    // Frame-rate budgets carry @fps: measured nightly on CI and in gate:phase, never by a laptop's task gate.
    expect(grep.test("[PD-03] 200-burst stress at 4× CPU: 60 fps @fps")).toBe(false);
    expect(args.slice(args.indexOf("--workers"), args.indexOf("--workers") + 2)).toEqual([
      "--workers",
      "1",
    ]);
  });
});
