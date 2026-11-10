import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { newId } from "@/lib/id";
import type { Principal } from "@/server/authz/policies";
import {
  authScope,
  mintAdminScope,
  mintCustomerScope,
  mintShopScope,
  type Scope,
  systemScope,
  type TenantScope,
} from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { memberships, outbox } from "@/server/db/schema";
import { writeOutbox } from "@/server/jobs/outbox";
import { jobDef } from "@/server/jobs/registry";
import { relayEnvelope } from "@/server/jobs/relay";
import { jobProcessor } from "@/server/jobs/worker";
import { transaction, withScope } from "@/server/repos/_base";
import { makeMembership, makeUser } from "@/server/testing/factories";
import { ROLES, type Role, world, type World } from "./harness";
import { TENANT_JOB, TENANT_QUEUE, tenantProbe } from "../support/tenant-job";
import type { Job } from "bullmq";

/**
 * [P0-20] C-30: background jobs are in the authz matrix. A tenant job runs under the scope of the request that
 * wrote its outbox row (rebuilt from the row in the database, not from the job data in Redis), so its handler
 * meets the same RLS walls: a payload naming another shop's id gets nothing.
 */
vi.mock("@/server/jobs/registry", async (importOriginal) =>
  (await import("../support/tenant-job")).withTenantProbe(await importOriginal()),
);

let w: World;
beforeAll(async () => {
  w = await world();
  for (const shopId of [w.shopA.id, w.shopB.id]) {
    await makeMembership((await makeUser()).id, shopId);
  }
});

/** The scope each role's request would have (what require*() returns for it), or null when it has none. */
function requestScope(p: Principal | null): TenantScope | null {
  if (!p) return null;
  if (p.adminRole) return mintAdminScope({ userId: p.userId, role: p.adminRole });
  const shop = p.shopRoles[0];
  if (shop) return mintShopScope({ userId: p.userId, shopId: shop.shopId, role: shop.role });
  return mintCustomerScope({ userId: p.userId });
}

async function produce(scope: Scope, payload: { note: string; shopId?: string }): Promise<string> {
  return transaction(scope, (tx) =>
    writeOutbox(scope, tx, TENANT_QUEUE, tenantProbe.name, payload as never),
  );
}

/** Runs the job of outbox row `id` through the real processor; the handler reads the payload's shop. */
async function runJob(id: string): Promise<{ scope: TenantScope | null; seen: number }> {
  const [row] = await db().select().from(outbox).where(eq(outbox.id, id));
  if (!row) throw new Error("outbox row missing");
  const def = jobDef(TENANT_QUEUE, TENANT_JOB);
  if (!def) throw new Error("tenant probe not registered");
  const out: { scope: TenantScope | null; seen: number } = { scope: null, seen: -1 };
  const processor = jobProcessor(TENANT_QUEUE, (name) =>
    name === TENANT_JOB
      ? {
          def,
          handler: async (payload, _job, ctx) => {
            out.scope = ctx.scope;
            const { shopId } = payload as { shopId: string };
            if (!ctx.scope) throw new Error("tenant job without a scope");
            // The handler trusts the payload's shop id, as a buggy handler might: RLS is what stops it.
            const rows = await withScope(ctx.scope, (q) =>
              q.select().from(memberships).where(eq(memberships.shopId, shopId)),
            );
            out.seen = rows.length;
          },
        }
      : undefined,
  );
  const job = {
    name: TENANT_JOB,
    id,
    data: relayEnvelope(row),
    timestamp: Date.now(),
  } as unknown as Job;
  await processor(job);
  return out;
}

/** Roles whose job may read shop A's members: shop A's active team and the (active) admins. */
const SEES_SHOP_A = new Set<Role>([
  "staff_own_shop",
  "owner_own_shop",
  "owner_own_shop_no_mfa",
  "admin_owner",
  "admin_support",
  "admin_moderator",
  "admin_finance",
  "admin_owner_no_mfa",
]);

describe("[P0-20] C-30 jobs matrix: a tenant job naming shop A's id, produced by each role", () => {
  for (const role of ROLES) {
    it(`${role}: ${SEES_SHOP_A.has(role) ? "reads shop A's rows" : "gets nothing (or cannot produce it)"}`, async () => {
      const scope = requestScope(w.principals[role]);
      if (!scope) {
        expect(SEES_SHOP_A.has(role)).toBe(false);
        return;
      }
      const id = await produce(scope, { note: role, shopId: w.shopA.id });
      const { scope: rebuilt, seen } = await runJob(id);
      expect(rebuilt).toEqual(scope);
      if (SEES_SHOP_A.has(role)) expect(seen).toBeGreaterThan(0);
      else expect(seen).toBe(0);
    });
  }

  it("shop A's own job naming shop B's id reads nothing, though shop B has members", async () => {
    const scope = requestScope(w.principals.owner_own_shop);
    if (!scope) throw new Error("owner has no scope");
    const { seen } = await runJob(await produce(scope, { note: "cross", shopId: w.shopB.id }));
    expect(seen).toBe(0);
    expect(
      await db().select().from(memberships).where(eq(memberships.shopId, w.shopB.id)),
    ).not.toHaveLength(0);
  });
});

describe("[P0-20] C-30 producers and the worker refuse mismatched origins", () => {
  it("a tenant scope cannot write a system job, and the identity layer or system cannot write a tenant job", async () => {
    const shop = requestScope(w.principals.owner_own_shop);
    if (!shop) throw new Error("owner has no scope");
    await expect(
      transaction(shop, (tx) =>
        writeOutbox(shop, tx, "email", "staff-lockout", { userId: newId(), reason: "password" }),
      ),
    ).rejects.toThrow(/runs as system; a shop scope may not write it/);
    for (const scope of [
      authScope("test: identity layer producer"),
      systemScope("test: system producer"),
    ]) {
      await expect(produce(scope, { note: "x" })).rejects.toThrow(/runs as tenant/);
    }
  });

  it("a tenant job whose outbox row is gone, or was not written by a tenant scope, is refused for good", async () => {
    const missing = newId();
    await db()
      .insert(outbox)
      .values({
        id: missing,
        queue: TENANT_QUEUE,
        jobName: TENANT_JOB,
        payload: { v: 1, data: { note: "x" } },
      });
    // scope_kind defaults to 'system': a row no tenant request wrote.
    await expect(runJob(missing)).rejects.toThrow(/was not written by a tenant scope/);
    const [row] = await db().select().from(outbox).where(eq(outbox.id, missing));
    await db().delete(outbox).where(eq(outbox.id, missing));
    const processor = jobProcessor(TENANT_QUEUE, () => ({
      def: jobDef(TENANT_QUEUE, TENANT_JOB) as NonNullable<ReturnType<typeof jobDef>>,
      handler: async () => undefined,
    }));
    const job = {
      name: TENANT_JOB,
      id: missing,
      data: relayEnvelope({ id: missing, payload: row?.payload }),
      timestamp: Date.now(),
    } as unknown as Job;
    await expect(processor(job)).rejects.toThrow(/tenant job without its outbox row/);
  });
});
