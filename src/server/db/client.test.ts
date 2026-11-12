import { beforeAll, describe, expect, it } from "vitest";

describe("[P0-20] one pool per database role, per process", () => {
  // The first import loads the driver, schema and env (cold, over 5 s on a busy laptop during the full
  // unit run): do it once in setup, so each test's timeout covers only its own checks.
  beforeAll(async () => {
    await import("./client");
  }, 60_000);

  it("the web process has no system (BYPASSRLS) pool, and no pool is opened for it", async () => {
    const { dbAs, dbProcess } = await import("./client");
    expect(dbProcess()).toBe("web");
    expect(() => dbAs("system")).toThrow(/the web process has no "system" database pool/);
  });

  it("budgets: web opens app + auth, the worker app + system", async () => {
    const { DB_POOL_MAX, processPoolMax } = await import("./client");
    expect(Object.keys(DB_POOL_MAX.web).sort()).toEqual(["app", "auth"]);
    expect(Object.keys(DB_POOL_MAX.worker).sort()).toEqual(["app", "system"]);
    expect(processPoolMax("web")).toBe(14);
    expect(processPoolMax("worker")).toBe(12);
  });
});
