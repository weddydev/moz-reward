import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * P0-15 D1: the host backup job writes its heartbeats through `record_backup_heartbeat(name)` (0016) as the
 * superuser. The function accepts `backup:<name>` only, and no application role may call it.
 */
describe("[P0-15] record_backup_heartbeat", () => {
  const opts = { max: 1, onnotice: () => {} } as const;
  const owner = postgres(process.env.DATABASE_URL_MIGRATIONS ?? "", opts);
  const worker = postgres(process.env.DATABASE_URL_WORKER ?? "", opts);
  const app = postgres(process.env.DATABASE_URL ?? "", opts);
  const auth = postgres(process.env.DATABASE_URL_AUTH ?? "", opts);

  afterAll(async () => {
    await owner`DELETE FROM job_heartbeats WHERE name LIKE 'backup:%'`;
    await Promise.all([owner.end(), worker.end(), app.end(), auth.end()]);
  });

  const lastRun = async (name: string): Promise<Date | undefined> => {
    const rows = await owner<{ last_run_at: Date }[]>`
      SELECT last_run_at FROM job_heartbeats WHERE name = ${name}`;
    return rows[0]?.last_run_at;
  };

  it("[P0-15] the superuser records and then refreshes a backup heartbeat", async () => {
    await owner`SELECT public.record_backup_heartbeat('backup:dump-failed')`;
    const first = await lastRun("backup:dump-failed");
    expect(first).toBeInstanceOf(Date);
    await owner`SELECT pg_sleep(0.01)`;
    await owner`SELECT public.record_backup_heartbeat('backup:dump-failed')`;
    const second = await lastRun("backup:dump-failed");
    expect(second?.getTime()).toBeGreaterThan(first?.getTime() ?? Infinity);
  });

  it.each([
    "scheduled:heartbeat",
    "backup:",
    "backup:Dump",
    "backup:dump;drop",
    "backup:" + "a".repeat(41),
    "xbackup:dump",
  ])("[P0-15] refuses a name outside backup:<lower-case name>: %j", async (name) => {
    await expect(owner`SELECT public.record_backup_heartbeat(${name})`).rejects.toMatchObject({
      code: "22023",
    });
    expect(await lastRun(name)).toBeUndefined();
  });

  it("[P0-15] refuses NULL", async () => {
    await expect(owner`SELECT public.record_backup_heartbeat(NULL)`).rejects.toMatchObject({
      code: "22023",
    });
  });

  it.each([
    ["moz_app", app],
    ["moz_auth", auth],
    ["moz_worker", worker],
  ] as const)("[P0-15] %s may not call it", async (_role, sql) => {
    await expect(sql`SELECT public.record_backup_heartbeat('backup:dump')`).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("[P0-15] is a SECURITY DEFINER owned by moz_rls with a pinned search_path", async () => {
    const [fn] = await owner<{ owner: string; definer: boolean; config: string[] | null }[]>`
      SELECT pg_get_userbyid(proowner) AS owner, prosecdef AS definer, proconfig AS config
        FROM pg_proc WHERE oid = 'public.record_backup_heartbeat(text)'::regprocedure`;
    expect(fn).toEqual({
      owner: "moz_rls",
      definer: true,
      config: ["search_path=pg_catalog, public, pg_temp"],
    });
    const [grant] = await owner<{ can: boolean }[]>`
      SELECT has_schema_privilege('moz_rls', 'public', 'CREATE') AS can`;
    expect(grant?.can).toBe(false);
  });
});

/**
 * P0-15 D2: the nightly run records two measurements through `record_backup_metric(name, value)` (0017), and the
 * worker reads WAL archiving from `pg_stat_archiver` as moz_worker (no heartbeat row).
 */
describe("[P0-15] record_backup_metric and pg_stat_archiver", () => {
  const opts = { max: 1, onnotice: () => {} } as const;
  const owner = postgres(process.env.DATABASE_URL_MIGRATIONS ?? "", opts);
  const worker = postgres(process.env.DATABASE_URL_WORKER ?? "", opts);
  const app = postgres(process.env.DATABASE_URL ?? "", opts);

  afterAll(async () => {
    await owner`DELETE FROM job_heartbeats WHERE name LIKE 'backup:%'`;
    await Promise.all([owner.end(), worker.end(), app.end()]);
  });

  const valueOf = async (name: string): Promise<string | null | undefined> => {
    const rows = await owner<{ value: string | null }[]>`
      SELECT value::text AS value FROM job_heartbeats WHERE name = ${name}`;
    return rows[0]?.value;
  };

  it("[P0-15] records and replaces storage bytes (beyond 2^31) and the key expiry", async () => {
    await owner`SELECT public.record_backup_metric('backup:storage', 1200)`;
    expect(await valueOf("backup:storage")).toBe("1200");
    await owner`SELECT public.record_backup_metric('backup:storage', 7999999999)`;
    expect(await valueOf("backup:storage")).toBe("7999999999");
    await owner`SELECT public.record_backup_metric('backup:key-expiry', 0)`;
    expect(await valueOf("backup:key-expiry")).toBe("0");
  });

  it.each([
    ["backup:dump", 1],
    ["scheduled:heartbeat", 1],
    ["backup:storage", -1],
    ["backup:storage", null],
    [null, 1],
  ] as const)("[P0-15] refuses %j = %j", async (name, value) => {
    await expect(
      owner`SELECT public.record_backup_metric(${name}, ${value}::bigint)`,
    ).rejects.toMatchObject({
      code: "22023",
    });
  });

  it("[P0-15] application roles may not call it; it is a SECURITY DEFINER owned by moz_rls", async () => {
    for (const sql of [app, worker]) {
      await expect(
        sql`SELECT public.record_backup_metric('backup:storage', 1)`,
      ).rejects.toMatchObject({
        code: "42501",
      });
    }
    const [fn] = await owner<{ owner: string; definer: boolean; config: string[] | null }[]>`
      SELECT pg_get_userbyid(proowner) AS owner, prosecdef AS definer, proconfig AS config
        FROM pg_proc WHERE oid = 'public.record_backup_metric(text, bigint)'::regprocedure`;
    expect(fn).toEqual({
      owner: "moz_rls",
      definer: true,
      config: ["search_path=pg_catalog, public, pg_temp"],
    });
  });

  it("[P0-15] moz_worker can read pg_stat_archiver (the health monitor's WAL check)", async () => {
    const rows = await worker<{ archived: number }[]>`
      SELECT archived_count::int AS archived FROM pg_stat_archiver`;
    expect(rows).toHaveLength(1);
  });
});
