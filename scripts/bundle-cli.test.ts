import { describe, expect, it } from "vitest";
import { CLI_ENTRIES, guardDirectRun, strayGuardProblem } from "./bundle-cli";

describe("[P0-15] bundle-cli: one bundle per entry; only the entry keeps its direct-run guard", () => {
  const guarded = `if (isDirectRun(import.meta.url)) {\n  main();\n}\n`;

  it("keeps the guard in the entry module (the bundle's own URL is argv[1])", () => {
    expect(
      guardDirectRun(guarded, "/repo/src/server/db/seed.ts", "/repo/src/server/db/seed.ts"),
    ).toBe(guarded);
  });

  it("turns every other module's guard into false, so importing seed.ts never runs the seed", () => {
    // In a bundle every module shares the bundle's import.meta.url: without this, demo:credentials (which
    // imports seed.ts) would also run the seed's main().
    const out = guardDirectRun(
      guarded,
      "/repo/src/server/db/seed.ts",
      "/repo/scripts/demo-credentials.ts",
    );
    expect(out).not.toContain("isDirectRun(import.meta.url)");
    expect(out).toContain("if (false");
  });

  it("fails the build when a differently written guard survives in a bundle", () => {
    const entry = `main();\n`;
    expect(strayGuardProblem(entry, `x();\n`)).toBeNull();
    expect(strayGuardProblem(entry, `if (isDirectRun(import.meta.url, argv)) seed();`)).toMatch(
      /1 isDirectRun\( calls in the bundle, expected 0/,
    );
    expect(strayGuardProblem(guarded, guarded)).toBeNull();
  });

  it("matches Windows and POSIX paths alike", () => {
    expect(guardDirectRun(guarded, "C:\\repo\\src\\a.ts", "C:/repo/src/a.ts")).toBe(guarded);
  });

  it("bundles the worker and every CLI the release and the RUNBOOK run on the host", () => {
    expect(Object.keys(CLI_ENTRIES).sort()).toEqual(
      ["demo-credentials", "migrate", "relay", "seed", "worker"].sort(),
    );
  });
});
