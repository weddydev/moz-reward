import { describe, expect, it } from "vitest";
import { evaluate, parseReport, type OsvReport } from "./osv-gate";

type Vuln = { id: string; severity?: string; fixed?: string; pkg?: string };

/** The shape osv-scanner v2 writes with `--format json` (trimmed to the fields the gate reads). */
const report = (
  pkg: string,
  version: string,
  groups: { ids: string[]; max_severity: string }[],
  vulns: Vuln[],
): OsvReport => ({
  results: [
    {
      packages: [
        {
          package: { name: pkg, version, ecosystem: "npm" },
          groups: groups.map((g) => ({ ...g, aliases: g.ids })),
          vulnerabilities: vulns.map((v) => ({
            id: v.id,
            summary: `summary of ${v.id}`,
            database_specific: v.severity === undefined ? {} : { severity: v.severity },
            affected: [
              {
                package: { name: v.pkg ?? pkg, ecosystem: "npm" },
                ranges: [
                  {
                    type: "SEMVER",
                    events: [
                      { introduced: "0" },
                      v.fixed === undefined ? { last_affected: version } : { fixed: v.fixed },
                    ],
                  },
                ],
              },
            ],
          })),
        },
      ],
    },
  ],
});

describe("[P0-14] OSV gate (SECURITY §10: block on high/critical with a fix available)", () => {
  it("blocks a high-severity vulnerability that has a fixed version", () => {
    const r = evaluate(
      report(
        "lib",
        "1.0.0",
        [{ ids: ["GHSA-high"], max_severity: "7.5" }],
        [{ id: "GHSA-high", fixed: "1.0.1" }],
      ),
    );
    expect(r.blocking).toEqual([
      expect.objectContaining({
        id: "GHSA-high",
        pkg: "lib@1.0.0",
        severity: "7.5",
        fixedIn: "1.0.1",
      }),
    ]);
    expect(r.other).toEqual([]);
  });

  it("reports but does not block: moderate with a fix, high without a fix", () => {
    const moderate = report(
      "qs",
      "6.15.1",
      [{ ids: ["GHSA-mod"], max_severity: "6.3" }],
      [{ id: "GHSA-mod", fixed: "6.16.0" }],
    );
    const highNoFix = report(
      "dm",
      "4.3.1",
      [{ ids: ["GHSA-nofix"], max_severity: "9.1" }],
      [{ id: "GHSA-nofix" }],
    );
    expect(evaluate(moderate)).toMatchObject({ blocking: [], other: [{ id: "GHSA-mod" }] });
    expect(evaluate(highNoFix)).toMatchObject({
      blocking: [],
      other: [{ id: "GHSA-nofix", fixedIn: null }],
    });
  });

  it("uses the advisory's label when the CVSS score is missing, and fails closed when both are unknown", () => {
    const labelled = report(
      "a",
      "1.0.0",
      [{ ids: ["G1"], max_severity: "" }],
      [{ id: "G1", severity: "CRITICAL", fixed: "2.0.0" }],
    );
    const unknown = report(
      "b",
      "1.0.0",
      [{ ids: ["G2"], max_severity: "" }],
      [{ id: "G2", fixed: "2.0.0" }],
    );
    const lowLabel = report(
      "c",
      "1.0.0",
      [{ ids: ["G3"], max_severity: "" }],
      [{ id: "G3", severity: "LOW", fixed: "2.0.0" }],
    );
    expect(evaluate(labelled).blocking).toHaveLength(1);
    expect(evaluate(unknown).blocking).toEqual([
      expect.objectContaining({ id: "G2", severity: "unknown" }),
    ]);
    expect(evaluate(lowLabel).blocking).toEqual([]);
  });

  it("only counts a fix that applies to the scanned package", () => {
    const fixForOtherPackage = report(
      "lib",
      "1.0.0",
      [{ ids: ["G"], max_severity: "8.0" }],
      [{ id: "G", fixed: "1.0.1", pkg: "other-lib" }],
    );
    expect(evaluate(fixForOtherPackage).blocking).toEqual([]);
  });

  it("finds the fix through any advisory in a group of aliases", () => {
    const r = report(
      "lib",
      "1.0.0",
      [{ ids: ["GHSA-a", "GHSA-b"], max_severity: "7.0" }],
      [{ id: "GHSA-a" }, { id: "GHSA-b", fixed: "1.2.0" }],
    );
    expect(evaluate(r).blocking).toEqual([
      expect.objectContaining({ id: "GHSA-a", fixedIn: "1.2.0" }),
    ]);
  });

  it("fails closed on advisories that no group covers (each counts on its own)", () => {
    const r = report("lib", "1.0.0", [], [{ id: "GHSA-loose", fixed: "1.0.1" }]);
    expect(evaluate(r).blocking).toEqual([
      expect.objectContaining({ id: "GHSA-loose", severity: "unknown", fixedIn: "1.0.1" }),
    ]);
    const labelled = report(
      "lib",
      "1.0.0",
      [],
      [{ id: "GHSA-low", severity: "LOW", fixed: "1.0.1" }],
    );
    expect(evaluate(labelled)).toMatchObject({
      blocking: [],
      other: [{ id: "GHSA-low", severity: "LOW" }],
    });
  });

  it("passes a clean report and refuses one it cannot read (never a silent pass)", () => {
    expect(evaluate({ results: [] })).toEqual({ blocking: [], other: [] });
    expect(evaluate(parseReport('{"results":[]}'))).toEqual({ blocking: [], other: [] });
    expect(() => parseReport("{not json")).toThrow();
    expect(() => parseReport('{"something":"else"}')).toThrow(/not an osv-scanner JSON report/);
  });
});
