import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkAllMigrations,
  checkConcurrentMigration,
  checkMigration,
  checkRls,
  rlsState,
} from "./check-migrations";

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

describe("[P0-20] every table has RLS enabled, forced and a policy unless declared global", () => {
  const create = 'CREATE TABLE "rewards" ("id" uuid PRIMARY KEY, "membership_id" uuid NOT NULL);';
  const enable = "ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;";
  const force = 'ALTER TABLE "public"."rewards" FORCE ROW LEVEL SECURITY;';
  const policy =
    "CREATE POLICY rewards_own ON rewards FOR SELECT TO moz_app USING (membership_id IS NOT NULL);";
  const files = (...sql: string[]) =>
    sql.map((s, i) => ({ name: `00${String(10 + i)}_x.sql`, sql: s }));

  it("passes a table with ENABLE, FORCE and a policy (also split across migrations)", () => {
    expect(checkRls(files([create, enable, force, policy].join("\n")))).toEqual([]);
    expect(checkRls(files(create, `${enable}\n${force}`, policy))).toEqual([]);
  });

  it("fails a new table without a policy (negative fixture)", () => {
    expect(checkRls(files([create, enable, force].join("\n")))).toEqual([
      expect.stringMatching(/"rewards".*no policy/),
    ]);
  });

  it("fails a new table without FORCE ROW LEVEL SECURITY (negative fixture)", () => {
    expect(checkRls(files([create, enable, policy].join("\n")))).toEqual([
      expect.stringMatching(/"rewards".*FORCE ROW LEVEL SECURITY/),
    ]);
  });

  it("fails a new table without RLS at all, naming every missing piece", () => {
    const [problem] = checkRls(files(create));
    expect(problem).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(problem).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(problem).toMatch(/no policy/);
  });

  it("fails when a later migration disables RLS, removes FORCE or drops the last policy", () => {
    const ok = [create, enable, force, policy].join("\n");
    expect(checkRls(files(ok, "ALTER TABLE rewards DISABLE ROW LEVEL SECURITY;"))).toHaveLength(1);
    expect(checkRls(files(ok, "ALTER TABLE rewards NO FORCE ROW LEVEL SECURITY;"))).toHaveLength(1);
    expect(checkRls(files(ok, "DROP POLICY IF EXISTS rewards_own ON rewards;"))).toHaveLength(1);
  });

  it("ignores commented-out statements", () => {
    expect(checkRls(files([create, enable, force, `-- ${policy}`].join("\n")))).toHaveLength(1);
  });

  it("accepts a table declared global with a reason, and not one without a reason", () => {
    expect(
      checkRls(files(`${create}\n-- rls: global rewards — test fixture with a long enough reason`)),
    ).toEqual([]);
    expect(checkRls(files(`${create}\n-- rls: global rewards`))).toHaveLength(1);
  });

  it("forgets a dropped table", () => {
    expect(checkRls(files(create, 'DROP TABLE "rewards";'))).toEqual([]);
  });

  it("the committed migrations pass and every app table is covered (the catalog test checks the live DB)", () => {
    const committed = readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((name) => ({ name, sql: readFileSync(`drizzle/${name}`, "utf8") }));
    expect(checkRls(committed)).toEqual([]);
    const state = rlsState(committed);
    // feature_flags/content_settings got RLS in 0010, so the checker verifies them (re-review 10).
    expect([...state.global.keys()].sort()).toEqual(["failed_jobs", "job_heartbeats"]);
    expect(state.tables.get("feature_flags")).toMatchObject({ enabled: true, forced: true });
    expect(state.tables.get("memberships")).toMatchObject({ enabled: true, forced: true });
    expect(state.problems).toEqual([]);
  });
});

describe("[P1-01] C-34: open moz_app policies need a reason; global markers count only where the table is created", () => {
  const create = 'CREATE TABLE "rewards" ("id" uuid PRIMARY KEY);';
  const rls = [
    "ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE rewards FORCE ROW LEVEL SECURITY;",
  ].join("\n");
  const open =
    "CREATE POLICY rewards_read ON rewards FOR SELECT TO moz_app, moz_auth USING (true);";
  const scoped = "CREATE POLICY rewards_k ON rewards FOR SELECT TO moz_app USING (id IS NOT NULL);";
  const reason = "-- rls: open rewards — the public catalogue, no tenant rows";
  const globalMarker = "-- rls: global rewards — test fixture with a long enough reason";
  const files = (...sql: string[]) =>
    sql.map((s, i) => ({ name: `00${String(20 + i)}_x.sql`, sql: s }));
  const one = (...parts: string[]) => parts.join("\n");

  it("fails a moz_app policy with USING (true) and no reason marker, naming file and policy", () => {
    expect(checkRls(files(one(create, rls, open)))).toEqual([
      expect.stringMatching(
        /^0020_x\.sql: policy "rewards_read" gives moz_app every row of "rewards"/,
      ),
    ]);
  });

  it("fails WITH CHECK (true), extra parentheses, upper case, a quoted role and no TO (PUBLIC)", () => {
    for (const p of [
      "CREATE POLICY w ON rewards FOR INSERT TO moz_app WITH CHECK (true);",
      "CREATE POLICY w ON rewards FOR SELECT TO moz_app USING ((TRUE));",
      'CREATE POLICY w ON rewards FOR SELECT TO "moz_app" USING ( true );',
      "CREATE POLICY w ON rewards FOR SELECT USING (true);",
      "CREATE POLICY w ON rewards FOR SELECT TO public USING (true);",
    ]) {
      expect(checkRls(files(one(create, rls, p))), p).toHaveLength(1);
    }
  });

  it("passes with the reason marker in the same migration only", () => {
    expect(checkRls(files(one(create, rls, reason, open)))).toEqual([]);
    expect(checkRls(files(one(create, rls, open), reason))).toHaveLength(1);
    expect(checkRls(files(one(create, rls, scoped), one(reason, open)))).toEqual([]);
  });

  it("ignores open policies for other roles and scoped moz_app policies; a short reason doesn't count", () => {
    const auth = "CREATE POLICY a ON rewards FOR ALL TO moz_auth USING (true) WITH CHECK (true);";
    expect(checkRls(files(one(create, rls, auth, scoped)))).toEqual([]);
    expect(checkRls(files(one(create, rls, "-- rls: open rewards — short", open)))).toHaveLength(1);
  });

  it("forgets an open policy that a later migration drops", () => {
    expect(
      checkRls(files(one(create, rls, open, scoped), "DROP POLICY rewards_read ON rewards;")),
    ).toEqual([]);
  });

  it("counts a global marker only in the migration that creates the table", () => {
    expect(checkRls(files(one(create, globalMarker)))).toEqual([]);
    const late = checkRls(files(create, globalMarker));
    expect(late).toContainEqual(
      expect.stringMatching(
        /^0021_x\.sql: "-- rls: global rewards" only counts in the migration that creates "rewards"/,
      ),
    );
    expect(late).toContainEqual(
      expect.stringMatching(/table "rewards": ENABLE ROW LEVEL SECURITY/),
    );
  });

  it("a re-created table loses its earlier global status", () => {
    expect(
      checkRls(files(one(create, globalMarker), 'DROP TABLE "rewards";', create)),
    ).toHaveLength(1);
  });
});
