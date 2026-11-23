import { describe, expect, it } from "vitest";
import { confirmRunArgs, flakyTests, type PwReport } from "./e2e-flakes";

/** A Playwright JSON report shaped like the real one (suites nest; each spec has one test per project). */
const report = (
  tests: { file: string; line: number; title: string; project: string; status: string }[],
): PwReport => ({
  suites: [
    {
      title: "outer",
      specs: [],
      suites: tests.map((t) => ({
        title: t.file,
        specs: [
          {
            title: t.title,
            file: t.file,
            line: t.line,
            tests: [{ projectName: t.project, status: t.status }],
          },
        ],
      })),
    },
  ],
});

describe("[P0-14] flake confirmation (process fix 2, human 23 Nov)", () => {
  it("[P0-14] finds the tests that failed and then passed on retry, nothing else", () => {
    const r = report([
      {
        file: "a.spec.ts",
        line: 17,
        title: "[PD-04] ripple",
        project: "desktop1440",
        status: "flaky",
      },
      { file: "b.spec.ts", line: 5, title: "[PD-07] dock", project: "pixel7", status: "expected" },
      {
        file: "c.spec.ts",
        line: 9,
        title: "[PD-06] flip",
        project: "webkit",
        status: "unexpected",
      },
      { file: "d.spec.ts", line: 3, title: "[PD-02] glow", project: "pixel7", status: "skipped" },
    ]);
    expect(flakyTests(r)).toEqual([
      { file: "a.spec.ts", line: 17, title: "[PD-04] ripple", project: "desktop1440" },
    ]);
  });

  it("[P0-14] an empty or missing report has no flakes", () => {
    expect(flakyTests({ suites: [] })).toEqual([]);
    expect(flakyTests({})).toEqual([]);
  });

  it("[P0-14] the confirmation re-runs that one test 5×, no retries, on its own project; parity and @perf keep their mode", () => {
    expect(
      confirmRunArgs({
        file: "a.spec.ts",
        line: 17,
        title: "[PD-04] ripple",
        project: "desktop1440",
      }),
    ).toEqual({
      args: [
        "e2e",
        "a.spec.ts:17",
        "--project",
        "desktop1440",
        "--repeat-each",
        "5",
        "--retries",
        "0",
      ],
      env: {},
    });
    expect(
      confirmRunArgs({
        file: "p.spec.ts",
        line: 4,
        title: "[PD-08] shop",
        project: "parity-chromium",
      }).args,
    ).toEqual([
      "e2e",
      "--parity",
      "p.spec.ts:4",
      "--project",
      "parity-chromium",
      "--repeat-each",
      "5",
      "--retries",
      "0",
    ]);
    const perf = confirmRunArgs({
      file: "f.spec.ts",
      line: 2,
      title: "[PD-03] stress @perf",
      project: "pixel7",
    });
    expect(perf.env).toEqual({ PERF: "1" });
    expect(perf.args).toContain("--workers");
  });
});
