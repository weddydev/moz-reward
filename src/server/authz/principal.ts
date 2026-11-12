import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq } from "drizzle-orm";

import { getSession } from "@/server/auth/session";
import { adminMembers, shopStaff } from "@/server/db/schema";
import { env } from "@/server/env";
import { poolFor } from "@/server/repos/_base";
import { currentAdminAccess } from "@/server/security/admin-access";
import { authScope } from "./scope";
import type { Principal } from "./policies";

/** Roles are read as `moz_auth` (P0-20): this runs before the principal, and so any scope, exists. */
const PRINCIPAL = authScope("principal: the signed-in user's shop and admin roles");
const db = (): ReturnType<typeof poolFor> => poolFor(PRINCIPAL);

/** Loads the principal for a user id + session facts (used by request code and tests). */
export async function loadPrincipal(input: {
  userId: string;
  mfaVerified: boolean;
  sessionCreatedAt: Date;
  sessionId?: string;
  /** The request's client address; only the admin IP allowlist reads it (C-24). */
  clientIp?: string;
}): Promise<Principal> {
  const [staffRows, adminRows] = await Promise.all([
    db()
      .select({
        shopId: shopStaff.shopId,
        role: shopStaff.role,
        perAwardLimit: shopStaff.perAwardLimit,
      })
      .from(shopStaff)
      .where(and(eq(shopStaff.userId, input.userId), eq(shopStaff.active, true))),
    db()
      .select({ role: adminMembers.role })
      .from(adminMembers)
      .where(and(eq(adminMembers.userId, input.userId), eq(adminMembers.active, true)))
      .limit(1),
  ]);
  return { ...input, shopRoles: staffRows, adminRole: adminRows[0]?.role ?? null };
}

const testPrincipal = new AsyncLocalStorage<{ principal: Principal | null }>();

/**
 * Test-only: run `fn` as `principal` (null = anonymous). Throws outside APP_ENV=test so it can
 * never become an auth bypass. Used by the authz matrix (tests/authz/).
 */
export function runAsPrincipal<T>(principal: Principal | null, fn: () => Promise<T>): Promise<T> {
  if (env().APP_ENV !== "test") throw new Error("runAsPrincipal is only available in tests");
  return testPrincipal.run({ principal }, fn);
}

/**
 * The address this request came from, for the admin IP allowlist. Outside a request (no `headers()`) it is
 * "unknown", which a configured allowlist refuses.
 */
async function requestClientIp(): Promise<string> {
  return (await currentAdminAccess()).ip;
}

/** Current request's principal, or null when signed out. */
export async function currentPrincipal(): Promise<Principal | null> {
  const override = testPrincipal.getStore();
  if (override) {
    if (env().APP_ENV !== "test") throw new Error("test principal outside tests");
    return override.principal;
  }
  const session = await getSession(); // applies the staff/admin session limits
  if (!session) return null;
  return loadPrincipal({
    userId: session.user.id,
    mfaVerified: session.session.mfaVerified === true,
    sessionCreatedAt: new Date(session.session.createdAt),
    sessionId: session.session.id,
    clientIp: await requestClientIp(),
  });
}
