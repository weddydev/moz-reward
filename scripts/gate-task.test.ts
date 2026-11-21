import { describe, expect, it } from "vitest";
import {
  affectedE2eArgs,
  GATE_E2E_PROJECTS,
  GATE_HOST_PROJECTS,
  GATE_LINUX_PROJECTS,
  perfE2eArgs,
  taskE2eArgs,
} from "./gate-task";

const projectsIn = (args: string[]): string[] =>
  args.flatMap((a, i) => (args[i - 1] === "--project" ? [a] : []));

describe("[P0-14] gate:task E2E runs where CI runs it (process audit, 21 Nov)", () => {
  it("[P0-14] the task's specs run on all five projects, CI's pixel7 + desktop1440 among them", () => {
    expect([...GATE_E2E_PROJECTS].sort()).toEqual(
      ["chromium", "desktop1440", "iphone14", "pixel7", "webkit"].sort(),
    );
    const all = [
      ...projectsIn(taskE2eArgs(["PD-03"], GATE_LINUX_PROJECTS)),
      ...projectsIn(taskE2eArgs(["PD-03"], GATE_HOST_PROJECTS)),
    ];
    expect(all.sort()).toEqual([...GATE_E2E_PROJECTS].sort());
    const args = taskE2eArgs(["PD-03"], GATE_LINUX_PROJECTS);
    expect(args).toContain("--grep");
    expect(args).toContain("--pass-with-no-tests");
  });

  it("[P0-14] Chromium projects run in the Linux container, WebKit projects on the host's WebKit (21 Nov)", () => {
    // Linux WebKit in the laptop's Docker VM renders ~1 frame/s after a load (DECISIONS 21 Nov): timing specs
    // fail there deterministically, while CI's Linux and the host's WebKit pass them.
    expect([...GATE_LINUX_PROJECTS]).toEqual(["chromium", "pixel7", "desktop1440"]);
    expect([...GATE_HOST_PROJECTS]).toEqual(["webkit", "iphone14"]);
    expect(projectsIn(taskE2eArgs(["PD-03"], GATE_LINUX_PROJECTS))).toEqual([
      "chromium",
      "pixel7",
      "desktop1440",
    ]);
    expect(projectsIn(perfE2eArgs(["PD-03"], GATE_HOST_PROJECTS))).toEqual(["webkit", "iphone14"]);
  });

  it("[P0-14] specs whose test-side files changed since main also run (Playwright --only-changed)", () => {
    const args = affectedE2eArgs();
    expect(args).toContain("--only-changed=origin/main");
    expect(projectsIn(args)).toEqual(["pixel7", "desktop1440"]);
    expect(args).not.toContain("--grep");
    expect(args).toContain("--pass-with-no-tests");
  });
});

describe("[P0-14] perf-budget specs run alone, one worker (process audit, 21 Nov)", () => {
  it("[P0-14] only the task's @perf specs, on one worker", () => {
    const args = perfE2eArgs(["PD-03"], GATE_LINUX_PROJECTS);
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
