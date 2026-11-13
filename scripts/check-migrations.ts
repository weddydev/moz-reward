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
 * From P0-18 (C-18): an index on an existing table is built CONCURRENTLY in drizzle/concurrent/ (see
 * `checkConcurrentMigration` and src/server/db/migrate.ts), never inside a transactional migration.
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
    if (existing(indexed)) {
      problems.push(
        `${name}: CREATE INDEX on existing table "${indexed}" blocks writes while it builds; put it in drizzle/concurrent/ as CREATE INDEX CONCURRENTLY IF NOT EXISTS (non-transactional helper, DECISIONS 2026-11-10).`,
      );
    }
    if (/^\s*(?:CREATE\s+(?:UNIQUE\s+)?INDEX|DROP\s+INDEX)\s+CONCURRENTLY\b/i.test(stmt)) {
      problems.push(
        `${name}: CONCURRENTLY cannot run inside a transaction (Drizzle applies these files in one); use drizzle/concurrent/.`,
      );
    }
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

/**
 * Non-transactional migrations (P0-18, C-18): `drizzle/concurrent/NNNN_name.sql`, applied by
 * src/server/db/migrate.ts after the Drizzle migrations, outside a transaction, once each (tracked in
 * `moz_concurrent_migrations`). Exactly one statement per file, and it must be safe to re-run after a crash:
 * `CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS …`, or `DROP INDEX CONCURRENTLY IF EXISTS …` with a
 * `-- contract:` line.
 */
export const CONCURRENT_DIR = path.join("drizzle", "concurrent");
const CONCURRENT_CREATE = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\b/i;
const CONCURRENT_DROP = /^DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\b/i;

export function checkConcurrentMigration(name: string, sql: string): string[] {
  const stmts = statements(stripComments(sql));
  if (stmts.length !== 1) {
    return [
      `${name}: a concurrent migration holds exactly one statement (found ${String(stmts.length)}).`,
    ];
  }
  const stmt = stmts[0] ?? "";
  if (CONCURRENT_DROP.test(stmt)) {
    return CONTRACT.test(sql)
      ? []
      : [`${name}: DROP INDEX without a "-- contract: <why it is safe>" line.`];
  }
  if (!CONCURRENT_CREATE.test(stmt)) {
    return [
      `${name}: only "CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS" (or "DROP INDEX CONCURRENTLY IF EXISTS") belongs here.`,
    ];
  }
  return [];
}

/**
 * Row-Level Security rule (P0-20, SECURITY §3). Deny by default: at the end of the migration history every
 * table must have `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` and at least one policy, unless a
 * migration declares it global with a reason (`-- rls: global <table> — <why no tenant rows>`). Statements are
 * read in order across files, so a later DISABLE / NO FORCE / DROP POLICY counts. Written-out statements only:
 * dynamic SQL (EXECUTE format(...)) is invisible here, which is why 0009 spells every table out.
 * tests/integration/rls-catalog.test.ts checks the same thing on the live database.
 */
type RlsTable = {
  enabled: boolean;
  forced: boolean;
  policies: Set<string>;
  /** Policies that give `moz_app` every row (`USING (true)` / `WITH CHECK (true)`) with no reason → file. */
  openUnmarked: Map<string, string>;
};
export type RlsState = {
  tables: Map<string, RlsTable>;
  global: Map<string, string>;
  /** Markers that don't count (e.g. a `global` marker outside the migration that creates the table). */
  problems: string[];
};

const NAME = String.raw`(?:"?\w+"?\.)?"?(\w+)"?`;
const RLS_PATTERNS = {
  create: new RegExp(String.raw`^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}`, "i"),
  drop: new RegExp(String.raw`^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?${NAME}`, "i"),
  alter: new RegExp(
    String.raw`^ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?${NAME}\s+(ENABLE|DISABLE|FORCE|NO\s+FORCE)\s+ROW\s+LEVEL\s+SECURITY\b`,
    "i",
  ),
  createPolicy: new RegExp(String.raw`^CREATE\s+POLICY\s+"?(\w+)"?\s+ON\s+${NAME}`, "i"),
  dropPolicy: new RegExp(
    String.raw`^DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?\s+ON\s+${NAME}`,
    "i",
  ),
};
const GLOBAL_MARKER = /^--\s*rls:\s*global\s+(\w+)(?:\s+[—–-]+\s*(.*))?$/gim;
const OPEN_MARKER = /^--\s*rls:\s*open\s+(\w+)(?:\s+[—–-]+\s*(.*))?$/gim;

/**
 * C-34: a `global` marker counts only in the migration that creates the table, so a later migration can't
 * quietly exempt a table that already holds tenant rows. These two predate the rule (0004 created them, 0009
 * declared them global when RLS arrived) and stay accepted by name.
 */
const GRANDFATHERED_GLOBAL = new Set(["0009_rls.sql:failed_jobs", "0009_rls.sql:job_heartbeats"]);

/** `marker table — reason` lines of one file (reason ≥ 10 characters, or the marker doesn't count). */
function markers(sql: string, pattern: RegExp): Map<string, string> {
  const found = new Map<string, string>();
  for (const m of sql.matchAll(pattern)) {
    const reason = (m[2] ?? "").trim();
    if (m[1] && reason.length >= 10) found.set(m[1].toLowerCase(), reason);
  }
  return found;
}

const POLICY_ROLES = /\bTO\s+(.+?)(?=\s+USING\b|\s+WITH\s+CHECK\b|$)/is;
const ALWAYS_TRUE = /\b(?:USING|WITH\s+CHECK)\s*\(\s*\(*\s*true\s*\)*\s*\)/i;

/** Whether a CREATE POLICY gives the web role (`moz_app`, or PUBLIC when no role is named) every row. */
function opensToApp(stmt: string): boolean {
  if (!ALWAYS_TRUE.test(stmt)) return false;
  const roles = POLICY_ROLES.exec(stmt)?.[1];
  if (roles === undefined) return true;
  return roles
    .split(",")
    .map((r) => r.trim().replace(/"/g, "").toLowerCase())
    .some((r) => r === "moz_app" || r === "public");
}

export function rlsState(files: readonly { name: string; sql: string }[]): RlsState {
  const tables = new Map<string, RlsTable>();
  const global = new Map<string, string>();
  const problems: string[] = [];
  for (const { name, sql } of files) {
    const globalHere = markers(sql, GLOBAL_MARKER);
    const openHere = markers(sql, OPEN_MARKER);
    const createdHere = new Set<string>();
    for (const stmt of statements(stripComments(sql))) {
      const created = RLS_PATTERNS.create.exec(stmt)?.[1]?.toLowerCase();
      if (created) {
        tables.set(created, {
          enabled: false,
          forced: false,
          policies: new Set(),
          openUnmarked: new Map(),
        });
        createdHere.add(created);
        global.delete(created);
        continue;
      }
      const dropped = RLS_PATTERNS.drop.exec(stmt)?.[1]?.toLowerCase();
      if (dropped) {
        tables.delete(dropped);
        global.delete(dropped);
        continue;
      }
      const alter = RLS_PATTERNS.alter.exec(stmt);
      const altered = alter?.[1] ? tables.get(alter[1].toLowerCase()) : undefined;
      if (alter && altered) {
        const action = (alter[2] ?? "").toUpperCase().replace(/\s+/g, " ");
        if (action === "ENABLE") altered.enabled = true;
        if (action === "DISABLE") altered.enabled = false;
        if (action === "FORCE") altered.forced = true;
        if (action === "NO FORCE") altered.forced = false;
        continue;
      }
      const created2 = RLS_PATTERNS.createPolicy.exec(stmt);
      if (created2?.[1] && created2[2]) {
        const policy = created2[1].toLowerCase();
        const onTable = created2[2].toLowerCase();
        const t = tables.get(onTable);
        t?.policies.add(policy);
        if (t && opensToApp(stmt) && !openHere.has(onTable)) t.openUnmarked.set(policy, name);
        continue;
      }
      const dropped2 = RLS_PATTERNS.dropPolicy.exec(stmt);
      if (dropped2?.[1] && dropped2[2]) {
        const t = tables.get(dropped2[2].toLowerCase());
        t?.policies.delete(dropped2[1].toLowerCase());
        t?.openUnmarked.delete(dropped2[1].toLowerCase());
      }
    }
    for (const [table, reason] of globalHere) {
      if (createdHere.has(table) || GRANDFATHERED_GLOBAL.has(`${name}:${table}`)) {
        global.set(table, reason);
      } else {
        problems.push(
          `${name}: "-- rls: global ${table}" only counts in the migration that creates "${table}" (C-34)`,
        );
      }
    }
  }
  return { tables, global, problems };
}

export function checkRls(files: readonly { name: string; sql: string }[]): string[] {
  const { tables, global, problems } = rlsState(files);
  for (const [table, t] of tables) {
    for (const [policy, file] of t.openUnmarked) {
      problems.push(
        `${file}: policy "${policy}" gives moz_app every row of "${table}" (USING/WITH CHECK true); add "-- rls: open ${table} — <reason>" in the same migration or scope it (C-34)`,
      );
    }
    if (global.has(table)) continue;
    const missing = [
      t.enabled ? null : "ENABLE ROW LEVEL SECURITY",
      t.forced ? null : "FORCE ROW LEVEL SECURITY",
      t.policies.size > 0 ? null : "no policy",
    ].filter((m): m is string => m !== null);
    if (missing.length > 0) {
      problems.push(
        `table "${table}": ${missing.join(", ")} (SECURITY §3: every table gets RLS, FORCE and policies, or "-- rls: global ${table} — <reason>")`,
      );
    }
  }
  return problems;
}

/** Every committed migration, both kinds. Empty when all pass. */
export function checkAllMigrations(dir = "drizzle"): string[] {
  const sqlFiles = (d: string): string[] => {
    try {
      return readdirSync(d)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch {
      return [];
    }
  };
  const concurrentDir = path.join(dir, "concurrent");
  const migrations = sqlFiles(dir).map((f) => ({
    name: f,
    sql: readFileSync(path.join(dir, f), "utf8"),
  }));
  return [
    ...migrations.flatMap((m) => checkMigration(m.name, m.sql)),
    ...checkRls(migrations),
    ...sqlFiles(concurrentDir).flatMap((f) =>
      checkConcurrentMigration(
        `concurrent/${f}`,
        readFileSync(path.join(concurrentDir, f), "utf8"),
      ),
    ),
  ];
}
function main(): void {
  const problems = checkAllMigrations();
  if (problems.length > 0) {
    console.error(`[migrations] not expand-only:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
}

if (isDirectRun(import.meta.url)) main();
