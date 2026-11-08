/**
 * Expand-only migration check (P0-03, ENGINEERING §6), part of `pnpm lint`. Migrations run before traffic
 * switches, so old code must keep working against the new schema. A migration with a destructive or blocking
 * statement (drop/rename, type change, SET NOT NULL, truncate, delete) must carry a reviewed justification
 * line `-- contract: <why this is safe>` (e.g. the expand and migrate steps already shipped).
 * The baseline migration (0000) is exempt.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDirectRun } from "../src/lib/is-direct-run";

export const DESTRUCTIVE: readonly { label: string; pattern: RegExp }[] = [
  { label: "DROP TABLE", pattern: /\bDROP\s+TABLE\b/i },
  { label: "DROP COLUMN", pattern: /\bDROP\s+COLUMN\b/i },
  { label: "DROP TYPE", pattern: /\bDROP\s+TYPE\b/i },
  { label: "DROP SCHEMA", pattern: /\bDROP\s+SCHEMA\b/i },
  { label: "RENAME", pattern: /\bRENAME\b/i },
  { label: "column type change", pattern: /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i },
  { label: "SET NOT NULL", pattern: /\bSET\s+NOT\s+NULL\b/i },
  // Statements only (line start): `BEFORE TRUNCATE ON …` triggers and `REVOKE … TRUNCATE` are not data loss.
  { label: "TRUNCATE", pattern: /^\s*TRUNCATE\b/im },
  { label: "DELETE FROM", pattern: /^\s*DELETE\s+FROM\b/im },
];

const CONTRACT = /^--\s*contract:\s*(.{10,})$/im;

/** Removes SQL comments so commented-out statements and prose never count. */
export const stripComments = (sql: string): string =>
  sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

export function checkMigration(name: string, sql: string): string[] {
  if (name.startsWith("0000_")) return [];
  const body = stripComments(sql);
  const found = DESTRUCTIVE.filter((d) => d.pattern.test(body)).map((d) => d.label);
  if (found.length === 0 || CONTRACT.test(sql)) return [];
  return [
    `${name}: ${found.join(", ")} without a "-- contract: <why it is safe>" line (expand → migrate → contract).`,
  ];
}

function main(): void {
  const dir = "drizzle";
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const problems = files.flatMap((f) => checkMigration(f, readFileSync(path.join(dir, f), "utf8")));
  if (problems.length > 0) {
    console.error(`[migrations] not expand-only:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
}

if (isDirectRun(import.meta.url)) main();
