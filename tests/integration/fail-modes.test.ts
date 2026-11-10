import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineAction, defineRoute } from "@/server/actionTemplate";
import { requireAdminRole } from "@/server/authz";
import { loadPrincipal, runAsPrincipal } from "@/server/authz/principal";
import { systemScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { featureFlags, outbox } from "@/server/db/schema";
import { upsertFlag } from "@/server/repos/flags";
import type * as RateLimitModule from "@/server/security/rate-limit";
import { makeActor } from "@/server/testing/factories";
import { tenantProbe } from "../support/tenant-job";

/**
 * Redis down (P0-18 AC2, ENGINEERING §5): fail-closed actions (auth, money) answer a friendly 503 with
 * Retry-After and write nothing; fail-open ones and public reads carry on. The limiter is the real one,
 * pointed at a Redis that refuses connections.
 */
const faults = vi.hoisted(() => ({ redisDown: null as Redis | null }));
vi.mock("@/server/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof RateLimitModule>();
  return {
    ...actual,
    limitOrThrow: (opts: Parameters<typeof actual.limitOrThrow>[0]) =>
      actual.limitOrThrow(
        opts,
        faults.redisDown ? actual.createLimiter(faults.redisDown) : undefined,
      ),
  };
});

// A tenant job: requests may only write tenant jobs to the outbox (P0-20, C-30).
vi.mock("@/server/jobs/registry", async (importOriginal) =>
  (await import("../support/tenant-job")).withTenantProbe(await importOriginal()),
);

const down = new Redis("redis://127.0.0.1:1", {
  lazyConnect: true,
  maxRetriesPerRequest: 0,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

afterEach(() => {
  faults.redisDown = null;
});
afterAll(() => {
  down.disconnect();
});

const owner = async () => {
  const { user } = await makeActor("admin_owner");
  return loadPrincipal({ userId: user.id, mfaVerified: true, sessionCreatedAt: new Date() });
};

/** A money-like write: a flag change plus an outbox side effect, both behind a fail-closed limit. */
function moneyLike(failMode: "open" | "closed") {
  return defineAction({
    name: `test.fail_${failMode}`,
    input: z.object({ key: z.string().min(1).max(60) }).strict(),
    authorize: (_i, p) => requireAdminRole(["owner"], p),
    rateLimit: { max: 10, windowSec: 60, failMode },
    transaction: true,
    handler: async ({ key }, scope, { tx, outbox: writeToOutbox }) => {
      await upsertFlag(scope, { key, enabled: true, description: "fail-mode probe" }, tx);
      await writeToOutbox(tenantProbe.queue, tenantProbe.name, {
        note: "fail-mode probe",
      });
      return key;
    },
  });
}

const flag = async (key: string) =>
  (await db().select().from(featureFlags).where(eq(featureFlags.key, key)))[0];

describe("[P0-18] Redis down: limiter fail modes (AC2)", () => {
  it("a fail-closed action returns UNAVAILABLE (503, retry in 60 s) and writes nothing", async () => {
    const admin = await owner();
    faults.redisDown = down;
    await db().delete(outbox);
    const res = await runAsPrincipal(admin, () => moneyLike("closed")({ key: "probe_closed" }));
    expect(res).toEqual({
      ok: false,
      error: {
        code: "UNAVAILABLE",
        message: "This is briefly unavailable. Please try again in a minute.",
      },
    });
    expect(await flag("probe_closed")).toBeUndefined();
    expect(await db().select().from(outbox)).toHaveLength(0);
  });

  it("the same action works again once Redis is back", async () => {
    const res = await runAsPrincipal(await owner(), () =>
      moneyLike("closed")({ key: "probe_closed_ok" }),
    );
    expect(res).toEqual({ ok: true, data: "probe_closed_ok" });
  });

  it("a fail-open action carries on while Redis is down", async () => {
    const admin = await owner();
    faults.redisDown = down;
    const res = await runAsPrincipal(admin, () => moneyLike("open")({ key: "probe_open" }));
    expect(res).toEqual({ ok: true, data: "probe_open" });
    expect((await flag("probe_open"))?.enabled).toBe(true);
  });

  it("route handlers: fail-closed POST is a 503 with Retry-After; a fail-open public GET still answers", async () => {
    faults.redisDown = down;
    const scope = systemScope("test: public read");
    const closed = defineRoute({
      name: "test.route_closed",
      input: z.object({ n: z.number().int() }).strict(),
      public: true,
      authorize: () => Promise.resolve(scope),
      rateLimit: { max: 10, windowSec: 60, failMode: "closed" },
      handler: () => Promise.resolve("written"),
    });
    const publicRead = defineRoute({
      name: "test.route_public_read",
      input: z.object({}).strict(),
      public: true,
      authorize: () => Promise.resolve(scope),
      rateLimit: { max: 60, windowSec: 60, failMode: "open" },
      handler: () => Promise.resolve({ shops: 3 }),
    });
    const origin = "http://localhost:3000";
    // Signed out (null principal), as a public caller would be.
    const post = await runAsPrincipal(null, () =>
      closed(
        new Request(`${origin}/api/test`, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ n: 1 }),
        }),
      ),
    );
    expect(post.status).toBe(503);
    expect(post.headers.get("retry-after")).toBe("60");
    expect(await post.json()).toMatchObject({ error: { code: "UNAVAILABLE" } });

    const get = await runAsPrincipal(null, () =>
      publicRead(new Request(`${origin}/api/test`, { method: "GET" })),
    );
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ data: { shops: 3 } });
  });
});
