import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { migrationClient, runConcurrentMigrations } from "@/server/db/migrate";

/** C-18 / P0-18: indexes on existing tables are built CONCURRENTLY, outside a transaction, once. */
describe("[P0-18] non-transactional migrations (drizzle/concurrent)", () => {
  const client = migrationClient(process.env.DATABASE_URL_MIGRATIONS ?? "");
  const dir = mkdtempSync(path.join(tmpdir(), "moz-concurrent-"));
  const index = `moz_probe_${String(process.pid)}_idx`;
  const file = `9000_probe_${String(process.pid)}.sql`;
  writeFileSync(
    path.join(dir, file),
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${index}" ON "users" ("name");`,
  );
  const valid = async (): Promise<boolean | undefined> => {
    const [row] = await client<{ valid: boolean }[]>`
      SELECT i.indisvalid AS valid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname = ${index}`;
    return row?.valid;
  };

  afterAll(async () => {
    await client.unsafe(`DROP INDEX IF EXISTS "${index}"`);
    await client`DELETE FROM drizzle.moz_concurrent_migrations WHERE name = ${file}`.catch(
      () => {},
    );
    await client.end();
    rmSync(dir, { recursive: true, force: true });
  });

  it("every migration connection fails fast on a lock (lock_timeout 5 s) and has a statement timeout", async () => {
    const [lock] = await client<{ lock_timeout: string }[]>`SHOW lock_timeout`;
    const [stmt] = await client<{ statement_timeout: string }[]>`SHOW statement_timeout`;
    expect(lock?.lock_timeout).toBe("5s");
    expect(stmt?.statement_timeout).toBe("5min");
  });

  it("builds the index outside a transaction, records it, and a re-run is a no-op", async () => {
    expect(await runConcurrentMigrations(client, dir)).toEqual([file]);
    expect(await valid()).toBe(true);
    expect(await runConcurrentMigrations(client, dir)).toEqual([]);
    // The session timeout is restored after the long-running build.
    const [stmt] = await client<{ statement_timeout: string }[]>`SHOW statement_timeout`;
    expect(stmt?.statement_timeout).toBe("5min");
  });

  it("an INVALID index left by a crashed build is dropped and rebuilt (IF NOT EXISTS alone would keep it)", async () => {
    await client`DELETE FROM drizzle.moz_concurrent_migrations WHERE name = ${file}`;
    // What a crash mid-build leaves behind (the local role is a superuser, so the catalogue can be edited).
    await client.unsafe(
      `UPDATE pg_index SET indisvalid = false WHERE indexrelid = '"${index}"'::regclass`,
    );
    expect(await valid()).toBe(false);
    expect(await runConcurrentMigrations(client, dir)).toEqual([file]);
    expect(await valid()).toBe(true);
  });
});
