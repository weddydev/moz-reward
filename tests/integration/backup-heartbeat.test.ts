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
