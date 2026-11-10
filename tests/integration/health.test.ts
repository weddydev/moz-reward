import { Redis } from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { mintAdminScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { opsSnapshot } from "@/server/db/schema";
import { healthTick, monitorKey } from "@/server/jobs/health-monitor";
import { createAlerter, deliverAlertEmail } from "@/server/ops/alerts";
import { checkReady, liveResponse, readyResponse, workerResponse } from "@/server/ops/ready";
import { readOpsSnapshot } from "@/server/repos/ops";
import { limiterRedis } from "@/server/security/rate-limit";
import { testEmail } from "../fixtures/auth";
import { makeAdmin, makeUser } from "../fixtures/factories";
import { latestEmailTo } from "../support/mailpit";

/** P0-13 AC2: health states (live / ready / worker) and the health monitor. */
const dead = new Redis("redis://127.0.0.1:1", {
  lazyConnect: true,
  maxRetriesPerRequest: 0,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
const TOKEN = "t".repeat(40);

afterAll(() => {
  dead.disconnect();
});

beforeEach(async () => {
  await limiterRedis().del(monitorKey());
});

const req = (headers: Record<string, string> = {}): Request =>
  new Request("http://localhost:3000/api/health/ready", { headers });

describe("[P0-13] AC2: health endpoints", () => {
  it("live: 200 with a constant body and nothing about the internals", async () => {
    const res = liveResponse();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("ready: 200 when Postgres and redis-queue answer, even with the worker down", async () => {
    const report = await checkReady();
    expect(report).toMatchObject({ ok: true, workerOk: false });
    const res = await readyResponse(req(), () => Promise.resolve(report));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("ready: Redis stopped → 503, status only without the token", async () => {
    const report = await checkReady({ redis: () => dead });
    expect(report.ok).toBe(false);
    expect(report.checks.redis.ok).toBe(false);
    const res = await readyResponse(req(), () => Promise.resolve(report));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "fail" });
  });

  it("ready: database unreachable → 503", async () => {
    const report = await checkReady({ db: () => Promise.reject(new Error("ECONNREFUSED")) });
    expect(report).toMatchObject({ ok: false, checks: { db: { ok: false }, redis: { ok: true } } });
  });

  it("detail needs the exact health token; a wrong or absent token gets the status only", async () => {
    const report = await checkReady({ redis: () => dead });
    const ask = async (
      headers: Record<string, string>,
      token: string | undefined,
    ): Promise<unknown> =>
      (
        await readyResponse(req(headers), () => Promise.resolve(report), token)
      ).json() as Promise<unknown>;
    expect(await ask({ authorization: `Bearer ${TOKEN}` }, TOKEN)).toMatchObject({
      status: "fail",
      checks: { redis: { ok: false }, db: { ok: true }, worker: { ok: false, ageSec: null } },
    });
    expect(await ask({ authorization: `Bearer ${TOKEN}x` }, TOKEN)).toEqual({ status: "fail" });
    expect(await ask({}, TOKEN)).toEqual({ status: "fail" });
    expect(await ask({ "x-health-token": TOKEN }, TOKEN)).toEqual({ status: "fail" }); // only the Bearer header
    // No HEALTH_TOKEN configured: nobody gets detail, whatever they send.
    expect(await ask({ authorization: "Bearer " }, undefined)).toEqual({ status: "fail" });
  });

  it("worker: 503 until the monitor has ticked, 200 after, 503 again once its mark is 3 min old", async () => {
    expect((await workerResponse(() => checkReady())).status).toBe(503);
    await limiterRedis().set(monitorKey(), new Date().toISOString(), "PX", 60_000);
    expect((await workerResponse(() => checkReady())).status).toBe(200);
    const old = new Date(Date.now() - 181_000).toISOString();
    await limiterRedis().set(monitorKey(), old, "PX", 60_000);
    expect(await (await workerResponse(() => checkReady())).json()).toEqual({ status: "fail" });
  });
});

describe("[P0-13] AC2: the health monitor", () => {
  it("Redis stopped: the tick still runs and emails both developers (health.redis)", async () => {
    const to = [testEmail("health-dev-a"), testEmail("health-dev-b")];
    const alerter = createAlerter({
      redis: () => dead,
      send: (a) => deliverAlertEmail(a, { to }),
    });
    const { snapshot, raised } = await healthTick({ redis: () => dead, alerter });
    expect(snapshot.redis.ok).toBe(false);
    expect(snapshot.db.ok).toBe(true);
    expect(raised).toContainEqual({ kind: "health.redis", result: "sent" });
    for (const address of to) {
      const mail = await latestEmailTo(address, { subject: "health.redis" });
      expect(mail.subject).toBe("[Moz test] ops alert: health.redis");
    }
  });

  it("a healthy tick stores the snapshot (admin owner reads it; other admin roles see nothing) and marks the worker alive", async () => {
    const sent: string[] = [];
    const alerter = createAlerter({
      redis: limiterRedis,
      keyPrefix: `t-${newId()}`,
      send: async (a) => {
        sent.push(a.kind);
      },
    });
    const { snapshot } = await healthTick({ alerter });
    expect(snapshot).toMatchObject({ db: { ok: true }, redis: { ok: true } });
    expect(snapshot.queues.map((q) => q.name)).toContain("email");
    expect(snapshot.disk.usedPct).toBeGreaterThan(0);
    expect(await limiterRedis().get(monitorKey())).toBe(snapshot.takenAt);

    const [row] = await db().select().from(opsSnapshot);
    expect(row?.takenAt.toISOString()).toBe(snapshot.takenAt);

    const owner = await makeUser();
    await makeAdmin(owner.id, "owner");
    const support = await makeUser();
    await makeAdmin(support.id, "support");
    const read = await readOpsSnapshot(mintAdminScope({ userId: owner.id, role: "owner" }));
    expect(read?.data).toMatchObject({ takenAt: snapshot.takenAt });
    expect(
      await readOpsSnapshot(mintAdminScope({ userId: support.id, role: "support" })),
    ).toBeNull();
  });
});
