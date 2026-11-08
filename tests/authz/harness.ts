/**
 * Authorisation matrix harness (SECURITY.md §3, TESTING.md §1).
 *
 * Every server action / route handler gets one `authzMatrix(...)` call listing which roles may run it.
 * The harness runs the action as each role with real DB-backed principals and asserts allow/deny.
 * `coverage.test.ts` fails if an exported action has no matrix entry.
 */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { ActionResult } from "@/server/actionTemplate";
import type { AdminRole, Principal } from "@/server/authz/policies";
import { loadPrincipal, runAsPrincipal } from "@/server/authz/principal";
import { db } from "@/server/db/client";
import { shops } from "@/server/db/schema";
import { makeAdmin, makeShop, makeStaff, makeUser } from "../fixtures/factories";

export const ROLES = [
  "anonymous",
  "customer",
  "staff_other_shop",
  "owner_other_shop",
  "staff_own_shop",
  "owner_own_shop",
  "owner_own_shop_no_mfa",
  "staff_own_shop_inactive",
  "admin_owner",
  "admin_support",
  "admin_moderator",
  "admin_finance",
  "admin_owner_no_mfa",
] as const;
export type Role = (typeof ROLES)[number];

export type World = {
  /** The shop the action targets ("own shop"). */
  shopA: { id: string };
  /** Another shop (cross-shop attacks come from here). */
  shopB: { id: string };
  principals: Record<Role, Principal | null>;
};

const DENIED = new Set(["UNAUTHENTICATED", "FORBIDDEN", "MFA_REQUIRED", "REAUTH_REQUIRED"]);

let worldPromise: Promise<World> | undefined;

async function principalFor(userId: string, mfaVerified = true) {
  return loadPrincipal({ userId, mfaVerified, sessionCreatedAt: new Date() });
}

async function buildWorld(): Promise<World> {
  const [shopA, shopB] = await Promise.all([
    makeShop({ name: "Authz A" }),
    makeShop({ name: "Authz B" }),
  ]);
  const user = async () => (await makeUser()).id;

  const ids = {
    customer: await user(),
    staffB: await user(),
    ownerB: await user(),
    staffA: await user(),
    ownerA: await user(),
    staffAInactive: await user(),
  };
  await makeStaff(shopB.id, ids.staffB, "staff", { perAwardLimit: 200 });
  await makeStaff(shopB.id, ids.ownerB, "owner");
  await makeStaff(shopA.id, ids.staffA, "staff", { perAwardLimit: 200 });
  await makeStaff(shopA.id, ids.ownerA, "owner");
  await makeStaff(shopA.id, ids.staffAInactive, "staff", { active: false });

  const admins: Partial<Record<AdminRole, string>> = {};
  for (const role of ["owner", "support", "moderator", "finance"] as const) {
    admins[role] = await user();
    await makeAdmin(admins[role], role);
  }

  return {
    shopA,
    shopB,
    principals: {
      anonymous: null,
      customer: await principalFor(ids.customer, false),
      staff_other_shop: await principalFor(ids.staffB),
      owner_other_shop: await principalFor(ids.ownerB),
      staff_own_shop: await principalFor(ids.staffA),
      owner_own_shop: await principalFor(ids.ownerA),
      owner_own_shop_no_mfa: await principalFor(ids.ownerA, false),
      staff_own_shop_inactive: await principalFor(ids.staffAInactive),
      admin_owner: await principalFor(admins.owner!),
      admin_support: await principalFor(admins.support!),
      admin_moderator: await principalFor(admins.moderator!),
      admin_finance: await principalFor(admins.finance!),
      admin_owner_no_mfa: await principalFor(admins.owner!, false),
    },
  };
}

/** One shared world per test file (rows are uniquely named, so files never collide). */
export const world = (): Promise<World> => (worldPromise ??= buildWorld());

/** Sanity: the world really has the shape the matrix relies on. */
export async function assertWorld() {
  const w = await world();
  const [a] = await db().select({ id: shops.id }).from(shops).where(eq(shops.id, w.shopA.id));
  expect(a?.id).toBe(w.shopA.id);
}

/**
 * Declares the allow-list for one action and generates one test per role.
 * `run` receives the world and must call the real action (input targeting shop A where relevant).
 */
export function authzMatrix(
  actionName: string,
  spec: { allow: ReadonlyArray<Role>; run: (w: World) => Promise<ActionResult<unknown>> },
) {
  describe(`[P0-07] authz: ${actionName}`, () => {
    for (const role of ROLES) {
      const expected = spec.allow.includes(role) ? "allow" : "deny";
      it(`${role} → ${expected}`, async () => {
        const w = await world();
        const result = await runAsPrincipal(w.principals[role], () => spec.run(w));
        if (expected === "allow") {
          expect(result.ok || !DENIED.has(result.error.code), JSON.stringify(result)).toBe(true);
        } else {
          expect(result.ok, `${role} must be denied`).toBe(false);
          if (!result.ok) expect(DENIED.has(result.error.code), JSON.stringify(result)).toBe(true);
        }
      });
    }
  });
}
