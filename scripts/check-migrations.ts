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
  { label: "DROP INDEX", pattern: /\bDROP\s+INDEX\b/i },
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
  const problems: string[] = [];
  const found = DESTRUCTIVE.filter((d) => d.pattern.test(body)).map((d) => d.label);
  if (found.length > 0 && !CONTRACT.test(sql)) {
    problems.push(
      `${name}: ${found.join(", ")} without a "-- contract: <why it is safe>" line (expand → migrate → contract).`,
    );
  }
  if (migrationNumber(name) > LOCK_RULES_FROM - 1) problems.push(...checkLocking(name, body));
  return problems;
}

/**
 * Locking rules (P0-14, TESTING §6, CR-L6) apply from migration 0007. 0001–0006 were applied before the rules
 * existed; Drizzle tracks applied migrations by hash, so they can't be edited (DECISIONS 2026-11-09).
 * Not yet here: "CREATE INDEX on an existing table must be CONCURRENTLY" — it needs P0-18's helper for
 * non-transactional migrations (CARRIED C-18).
 */
export const LOCK_RULES_FROM = 7;

export const migrationNumber = (name: string): number => Number(/^(\d{4})_/.exec(name)?.[1] ?? 0);

/** `"public"."users"`, `public.users`, `"users"`, `users` → `users`. */
const TABLE = String.raw`(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?(?:"?\w+"?\.)?"?(\w+)"?`;
const CREATED = new RegExp(String.raw`\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${TABLE}`, "gi");
const ALTERED = new RegExp(String.raw`\bALTER\s+TABLE\s+${TABLE}`, "i");
const INDEXED = new RegExp(
  String.raw`\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY)[\s\S]*?\bON\s+${TABLE}`,
  "i",
);
const LOCK_TIMEOUT = /\bSET\s+(?:LOCAL\s+)?lock_timeout\b/i;

/** Statements (`;` or Drizzle's `--> statement-breakpoint` already stripped as a comment). */
const statements = (body: string): string[] =>
  body
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * A statement that takes a strong lock on a table that already exists (not created in this migration) needs
 * `SET lock_timeout` in the migration, so a blocked migration fails fast instead of queueing every query
 * behind it. A new FOREIGN KEY or CHECK on an existing table must be added NOT VALID (validated later).
 */
export function checkLocking(name: string, body: string): string[] {
  const created = new Set([...body.matchAll(CREATED)].map((m) => (m[1] ?? "").toLowerCase()));
  const existing = (table: string | undefined): boolean =>
    table !== undefined && !created.has(table.toLowerCase());
  const problems: string[] = [];
  let locking = false;
  for (const stmt of statements(body)) {
    const altered = ALTERED.exec(stmt)?.[1];
    const indexed = INDEXED.exec(stmt)?.[1];
    const dropIndex = /^\s*DROP\s+INDEX\b(?!\s+CONCURRENTLY)/i.test(stmt);
    if (existing(altered) || existing(indexed) || dropIndex) locking = true;
    if (
      existing(altered) &&
      /\bADD\s+(?:CONSTRAINT\s+\S+\s+)?(?:FOREIGN\s+KEY|CHECK)\b/i.test(stmt) &&
      !/\bNOT\s+VALID\b/i.test(stmt)
    ) {
      problems.push(
        `${name}: new FOREIGN KEY/CHECK on existing table "${altered}" without NOT VALID (add NOT VALID, then VALIDATE CONSTRAINT in a later migration).`,
      );
    }
  }
  if (locking && !LOCK_TIMEOUT.test(body)) {
    problems.push(
      `${name}: locks an existing table without "SET lock_timeout = '5s';" at the top (a blocked migration must fail fast).`,
    );
  }
  return problems;
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
