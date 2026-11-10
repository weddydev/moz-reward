import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkMigration, checkAllMigrations, checkConcurrentMigration } from "./check-migrations";

describe("[P0-03] expand-only migration check", () => {
  it("passes additive migrations", () => {
    expect(
      checkMigration(
        "0004_x.sql",
        'CREATE TABLE "a" ("id" uuid);\nALTER TABLE "a" ADD COLUMN "b" text;',
      ),
    ).toEqual([]);
  });

  it.each([
    ['ALTER TABLE "a" DROP COLUMN "b";', "DROP COLUMN"],
    ['DROP TABLE "a";', "DROP TABLE"],
    ['ALTER TABLE "a" RENAME COLUMN "b" TO "c";', "RENAME"],
    ['ALTER TABLE "a" ALTER COLUMN "b" SET DATA TYPE integer;', "column type change"],
    ['ALTER TABLE "a" ALTER COLUMN "b" TYPE integer;', "column type change"],
    ['ALTER TABLE "a" ALTER COLUMN "b" SET NOT NULL;', "SET NOT NULL"],
    ['TRUNCATE "a";', "TRUNCATE"],
    ['DELETE FROM "a";', "DELETE FROM"],
  ])("flags %s", (sql, label) => {
    const [problem] = checkMigration("0004_x.sql", sql);
    expect(problem).toContain(label);
  });

  it("accepts a destructive migration that carries a contract justification", () => {
    expect(
      checkMigration(
        "0004_x.sql",
        '-- contract: column unused since release 1.4\nALTER TABLE "a" DROP COLUMN "b";',
      ),
    ).toEqual([]);
  });

  it("ignores statements in comments and exempts the baseline", () => {
    expect(checkMigration("0004_x.sql", '-- DROP TABLE "a";\n/* RENAME */ SELECT 1;')).toEqual([]);
    expect(checkMigration("0000_init.sql", 'DROP TABLE "a";')).toEqual([]);
  });

  it("every committed migration passes", () => {
    for (const f of readdirSync("drizzle").filter((n) => n.endsWith(".sql")))
      expect(checkMigration(f, readFileSync(`drizzle/${f}`, "utf8"))).toEqual([]);
  });
});

describe("[P0-03] expand-only check: statement position", () => {
  it("does not mistake trigger or privilege clauses for TRUNCATE/DELETE statements", () => {
    const sql =
      "CREATE TRIGGER t BEFORE TRUNCATE ON a FOR EACH STATEMENT EXECUTE FUNCTION f();\nREVOKE UPDATE, DELETE, TRUNCATE ON a FROM r;";
    expect(checkMigration("0004_x.sql", sql)).toEqual([]);
  });
});

describe("[P0-14] locking rules (from migration 0007)", () => {
  const LOCK = "SET lock_timeout = '5s';\n";

  it.each([
    ['ALTER TABLE "users" ADD COLUMN "nickname" text;', /without "SET lock_timeout/],
    ['ALTER TABLE "public"."users" ADD COLUMN "x" text;', /without "SET lock_timeout/],
    ['CREATE INDEX "users_x_idx" ON "users" ("x");', /drizzle\/concurrent/],
    [`${LOCK}CREATE UNIQUE INDEX "users_x_idx" ON "public"."users" ("x");`, /drizzle\/concurrent/],
    [
      'CREATE INDEX CONCURRENTLY "users_x_idx" ON "users" ("x");',
      /cannot run inside a transaction/,
    ],
    [
      'ALTER TABLE "sessions" ADD CONSTRAINT "s_u_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id");',
      /without NOT VALID/,
    ],
    ['ALTER TABLE "users" ADD CONSTRAINT "c" CHECK ("x" > 0);', /without NOT VALID/],
  ])("flags %s", (sql, problem) => {
    expect(checkMigration("0007_x.sql", sql).join("\n")).toMatch(problem);
  });

  it("flags DROP INDEX as destructive and as locking", () => {
    const problems = checkMigration("0007_x.sql", 'DROP INDEX "users_x_idx";').join("\n");
    expect(problems).toMatch(/DROP INDEX without a "-- contract/);
    expect(problems).toMatch(/without "SET lock_timeout/);
  });

  it("passes the same statements done safely", () => {
    for (const sql of [
      `${LOCK}ALTER TABLE "users" ADD COLUMN "nickname" text;`,
      `${LOCK}ALTER TABLE "sessions" ADD CONSTRAINT "s_u_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") NOT VALID;`,
      `${LOCK}ALTER TABLE "sessions" VALIDATE CONSTRAINT "s_u_fk";`,
    ]) {
      expect(checkMigration("0007_x.sql", sql), sql).toEqual([]);
    }
  });

  it("does not need a lock timeout for tables created in the same migration", () => {
    const sql = [
      'CREATE TABLE "offers" ("id" uuid PRIMARY KEY, "shop_id" uuid);',
      "--> statement-breakpoint",
      'ALTER TABLE "offers" ADD CONSTRAINT "o_s_fk" FOREIGN KEY ("shop_id") REFERENCES "shops"("id");',
      "--> statement-breakpoint",
      'CREATE INDEX "offers_shop_idx" ON "offers" ("shop_id");',
    ].join("\n");
    expect(checkMigration("0007_x.sql", sql)).toEqual([]);
  });

  it("leaves migrations applied before the rules (0001–0006) to the destructive check only", () => {
    expect(checkMigration("0006_x.sql", 'ALTER TABLE "users" ADD COLUMN "x" text;')).toEqual([]);
  });
});

describe("[P0-18] non-transactional migrations (drizzle/concurrent): CREATE INDEX CONCURRENTLY (C-18)", () => {
  it("accepts one concurrent, idempotent index build per file", () => {
    for (const sql of [
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_x_idx" ON "users" ("x");',
      'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "u_idx" ON "public"."users" ("x");',
      '-- contract: replaced by u_idx in 0001\nDROP INDEX CONCURRENTLY IF EXISTS "old_idx";',
    ]) {
      expect(checkConcurrentMigration("0001_x.sql", sql), sql).toEqual([]);
    }
  });

  it.each([
    ['CREATE INDEX "users_x_idx" ON "users" ("x");', /CONCURRENTLY IF NOT EXISTS/],
    ['CREATE INDEX CONCURRENTLY "users_x_idx" ON "users" ("x");', /CONCURRENTLY IF NOT EXISTS/],
    [
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "a" ON "users" ("x");\nCREATE INDEX CONCURRENTLY IF NOT EXISTS "b" ON "users" ("y");',
      /exactly one statement/,
    ],
    ['ALTER TABLE "users" ADD COLUMN "x" text;', /CONCURRENTLY IF NOT EXISTS/],
    ['DROP INDEX CONCURRENTLY IF EXISTS "old_idx";', /contract/],
  ])("rejects %s", (sql, problem) => {
    expect(checkConcurrentMigration("0001_x.sql", sql).join("\n")).toMatch(problem);
  });

  it("every committed concurrent migration passes", () => {
    expect(checkAllMigrations()).toEqual([]);
  });
});
