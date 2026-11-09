/**
 * `pnpm osv:gate <osv.json>` — the dependency-vulnerability gate (P0-14, SECURITY §10, ENGINEERING §14).
 * Reads `osv-scanner scan source --format json` output and fails only on what the policy blocks: a HIGH or
 * CRITICAL vulnerability (CVSS ≥ 7.0, or the advisory's label when there is no score) that has a fixed version.
 * Unknown severity with a fix also blocks (fail closed). Everything else is listed, not hidden: Renovate's weekly
 * update picks the fixes up, and a reviewer sees the list in every CI log.
 * A report that cannot be read fails the gate — never a silent pass.
 */
import { readFileSync } from "node:fs";
import { isDirectRun } from "../src/lib/is-direct-run";

type Event = { introduced?: string; fixed?: string; last_affected?: string };
type Pkg = { name?: string; ecosystem?: string };
type Advisory = {
  id: string;
  summary?: string;
  database_specific?: { severity?: string };
  affected?: { package?: Pkg; ranges?: { type?: string; events?: Event[] }[] }[];
};
type Group = { ids: string[]; aliases?: string[]; max_severity?: string };
export type OsvReport = {
  results: {
    packages?: {
      package: { name: string; version: string; ecosystem?: string };
      groups?: Group[];
      vulnerabilities?: Advisory[];
    }[];
  }[];
};

export type Finding = {
  id: string;
  pkg: string;
  /** CVSS score as written by OSV, the advisory label, or "unknown". */
  severity: string;
  fixedIn: string | null;
  summary: string;
};

const BLOCKING_SCORE = 7.0;
const BLOCKING_LABELS = new Set(["HIGH", "CRITICAL"]);

export function parseReport(json: string): OsvReport {
  const data: unknown = JSON.parse(json);
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as { results?: unknown }).results)
  )
    throw new Error("[osv] not an osv-scanner JSON report (no results array)");
  return data as OsvReport;
}

function fixedVersion(advisories: Advisory[], pkg: string): string | null {
  for (const a of advisories)
    for (const aff of a.affected ?? []) {
      if (aff.package?.name !== pkg) continue;
      for (const range of aff.ranges ?? [])
        for (const e of range.events ?? []) if (e.fixed) return e.fixed;
    }
  return null;
}

export function evaluate(report: OsvReport): { blocking: Finding[]; other: Finding[] } {
  const blocking: Finding[] = [];
  const other: Finding[] = [];
  for (const result of report.results)
    for (const p of result.packages ?? []) {
      const advisories = p.vulnerabilities ?? [];
      // Fail closed: an advisory that no group covers is judged on its own (as a group of one, no score).
      const grouped = new Set((p.groups ?? []).flatMap((g) => g.ids));
      const loose: Group[] = advisories
        .filter((a) => !grouped.has(a.id))
        .map((a) => ({ ids: [a.id], max_severity: "" }));
      for (const group of [...(p.groups ?? []), ...loose]) {
        const inGroup = advisories.filter((a) => group.ids.includes(a.id));
        const score = Number.parseFloat(group.max_severity ?? "");
        const label = inGroup
          .map((a) => a.database_specific?.severity?.toUpperCase())
          .find((l) => l !== undefined && l !== "");
        const severity = Number.isFinite(score) ? String(group.max_severity) : (label ?? "unknown");
        const high = Number.isFinite(score)
          ? score >= BLOCKING_SCORE
          : label === undefined || BLOCKING_LABELS.has(label);
        const fixedIn = fixedVersion(inGroup, p.package.name);
        const finding: Finding = {
          id: group.ids[0] ?? "(no id)",
          pkg: `${p.package.name}@${p.package.version}`,
          severity,
          fixedIn,
          summary: inGroup[0]?.summary ?? "",
        };
        (high && fixedIn !== null ? blocking : other).push(finding);
      }
    }
  return { blocking, other };
}

const line = (f: Finding): string =>
  `  ${f.id}  ${f.pkg}  severity ${f.severity}  fix ${f.fixedIn ?? "none"}  — ${f.summary}`;

function main(): void {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: pnpm osv:gate <osv-scanner JSON report>");
    process.exit(2);
  }
  let result: ReturnType<typeof evaluate>;
  try {
    result = evaluate(parseReport(readFileSync(file, "utf8")));
  } catch (e) {
    console.error(`[osv] cannot read ${file}: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
  if (result.other.length > 0)
    console.warn(
      `[osv] ${String(result.other.length)} below the blocking line (not high/critical with a fix):\n${result.other.map(line).join("\n")}`,
    );
  if (result.blocking.length > 0) {
    console.error(
      `[osv] BLOCKING — high/critical with a fix available; upgrade (or override) before merging:\n${result.blocking.map(line).join("\n")}`,
    );
    process.exit(1);
  }
  console.warn("[osv] pass: no high/critical vulnerability with a fix available");
}

if (isDirectRun(import.meta.url)) main();
