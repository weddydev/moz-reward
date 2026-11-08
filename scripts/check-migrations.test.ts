import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkMigration } from "./check-migrations";

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
