import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db/client";
import { adminMembers, shopStaff } from "@/server/db/schema";
import type { Principal } from "./policies";

/** Loads the principal for a user id + session facts (used by request code and tests). */
export async function loadPrincipal(input: {
  userId: string;
  mfaVerified: boolean;
  sessionCreatedAt: Date;
}): Promise<Principal> {
  const [staffRows, adminRows] = await Promise.all([
    db()
      .select({ shopId: shopStaff.shopId, role: shopStaff.role })
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

/** Current request's principal, or null when signed out. */
export async function currentPrincipal(): Promise<Principal | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return loadPrincipal({
    userId: session.user.id,
    mfaVerified: session.session.mfaVerified === true,
    sessionCreatedAt: new Date(session.session.createdAt),
  });
}
