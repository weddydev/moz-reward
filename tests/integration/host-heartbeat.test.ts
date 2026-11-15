import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * P0-15 C1b: the host's origin firewall (infra/host/moz-origin-firewall) writes its heartbeats through
 * `record_host_heartbeat(name)` (0018) as the superuser. The function accepts exactly
 * `host:origin-firewall` and `host:origin-firewall-failed`, and no application role may call it.
 */
describe("[P0-15] record_host_heartbeat", () => {
  const opts = { max: 1, onnotice: () => {} } as const;
  const owner = postgres(process.env.DATABASE_URL_MIGRATIONS ?? "", opts);
  const worker = postgres(process.env.DATABASE_URL_WORKER ?? "", opts);
  const app = postgres(process.env.DATABASE_URL ?? "", opts);
  const auth = postgres(process.env.DATABASE_URL_AUTH ?? "", opts);

  afterAll(async () => {
    await owner`DELETE FROM job_heartbeats WHERE name LIKE 'host:%'`;
    await Promise.all([owner.end(), worker.end(), app.end(), auth.end()]);
  });

  const lastRun = async (name: string): Promise<Date | undefined> => {
    const rows = await owner<{ last_run_at: Date }[]>`
      SELECT last_run_at FROM job_heartbeats WHERE name = ${name}`;
    return rows[0]?.last_run_at;
  };

  it.each(["host:origin-firewall", "host:origin-firewall-failed"])(
    "[P0-15] the superuser records and then refreshes %s",
    async (name) => {
      await owner`SELECT public.record_host_heartbeat(${name})`;
      const first = await lastRun(name);
      expect(first).toBeInstanceOf(Date);
      await owner`SELECT pg_sleep(0.01)`;
      await owner`SELECT public.record_host_heartbeat(${name})`;
      expect((await lastRun(name))?.getTime()).toBeGreaterThan(first?.getTime() ?? Infinity);
    },
  );

  it.each([
    "scheduled:heartbeat",
    "backup:dump",
    "host:",
    "host:other",
    "host:origin-firewall ",
    "HOST:origin-firewall",
    "host:origin-firewall;drop",
  ])("[P0-15] refuses any other name: %j", async (name) => {
    await expect(owner`SELECT public.record_host_heartbeat(${name})`).rejects.toMatchObject({
      code: "22023",
    });
    expect(await lastRun(name)).toBeUndefined();
  });

  it("[P0-15] refuses NULL", async () => {
    await expect(owner`SELECT public.record_host_heartbeat(NULL)`).rejects.toMatchObject({
      code: "22023",
    });
  });

  it.each([
    ["moz_app", app],
    ["moz_auth", auth],
    ["moz_worker", worker],
  ] as const)("[P0-15] %s may not call it", async (_role, sql) => {
    await expect(
      sql`SELECT public.record_host_heartbeat('host:origin-firewall')`,
    ).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("[P0-15] is a SECURITY DEFINER owned by moz_rls with a pinned search_path", async () => {
    const [fn] = await owner<{ owner: string; definer: boolean; config: string[] | null }[]>`
      SELECT pg_get_userbyid(proowner) AS owner, prosecdef AS definer, proconfig AS config
        FROM pg_proc WHERE oid = 'public.record_host_heartbeat(text)'::regprocedure`;
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
 * P0-15 C1b: moz-deploy records the staging origin certificate's expiry (epoch seconds) through
 * `record_host_metric(name, value)` (0019) as the superuser; only `host:origin-cert-expiry`, a non-negative value,
 * and no application role may call it.
 */
describe("[P0-15] record_host_metric", () => {
  const opts = { max: 1, onnotice: () => {} } as const;
  const owner = postgres(process.env.DATABASE_URL_MIGRATIONS ?? "", opts);
  const worker = postgres(process.env.DATABASE_URL_WORKER ?? "", opts);
  const app = postgres(process.env.DATABASE_URL ?? "", opts);
  const auth = postgres(process.env.DATABASE_URL_AUTH ?? "", opts);
  const NAME = "host:origin-cert-expiry";

  afterAll(async () => {
    await owner`DELETE FROM job_heartbeats WHERE name LIKE 'host:%'`;
    await Promise.all([owner.end(), worker.end(), app.end(), auth.end()]);
  });

  const value = async (name: string): Promise<string | null | undefined> => {
    const rows = await owner<{ value: string | null }[]>`
      SELECT value::text AS value FROM job_heartbeats WHERE name = ${name}`;
    return rows[0]?.value;
  };

  it("[P0-15] the superuser records the expiry and a later call replaces it", async () => {
    await owner`SELECT public.record_host_metric(${NAME}, 2267767560)`;
    expect(await value(NAME)).toBe("2267767560");
    await owner`SELECT public.record_host_metric(${NAME}, 2300000000)`;
    expect(await value(NAME)).toBe("2300000000");
  });

  it.each(["host:origin-firewall", "backup:key-expiry", "host:", "host:origin-cert-expiry "])(
    "[P0-15] refuses any other name: %j",
    async (name) => {
      await expect(owner`SELECT public.record_host_metric(${name}, 1)`).rejects.toMatchObject({
        code: "22023",
      });
    },
  );

  it("[P0-15] refuses a negative or NULL value and a NULL name", async () => {
    for (const q of [
      owner`SELECT public.record_host_metric(${NAME}, -1)`,
      owner`SELECT public.record_host_metric(${NAME}, NULL)`,
      owner`SELECT public.record_host_metric(NULL, 1)`,
    ]) {
      await expect(q).rejects.toMatchObject({ code: "22023" });
    }
  });

  it.each([
    ["moz_app", app],
    ["moz_auth", auth],
    ["moz_worker", worker],
  ] as const)("[P0-15] %s may not call it", async (_role, sql) => {
    await expect(
      sql`SELECT public.record_host_metric('host:origin-cert-expiry', 1)`,
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("[P0-15] is a SECURITY DEFINER owned by moz_rls with a pinned search_path", async () => {
    const [fn] = await owner<{ owner: string; definer: boolean; config: string[] | null }[]>`
      SELECT pg_get_userbyid(proowner) AS owner, prosecdef AS definer, proconfig AS config
        FROM pg_proc WHERE oid = 'public.record_host_metric(text, bigint)'::regprocedure`;
    expect(fn).toEqual({
      owner: "moz_rls",
      definer: true,
      config: ["search_path=pg_catalog, public, pg_temp"],
    });
  });
});
