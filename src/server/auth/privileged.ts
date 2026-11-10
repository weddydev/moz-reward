import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { ADMIN_SESSION_MAX_MS, STAFF_SESSION_MAX_MS } from "@/server/authz/policies";
import { db } from "@/server/db/client";
import { accounts, adminMembers, shopStaff, users } from "@/server/db/schema";

/**
 * Admin, staff (incl. anyone with a password credential: only staff/admins have one, public sign-up is off),
 * or neither. Admin wins (shorter session limit).
 * Inactive staff rows count too, so a suspended member can't fall back to a customer-style sign-in.
 */
export async function privilegedKind(userId: string): Promise<"admin" | "staff" | null> {
  const [staff, admin, credential] = await Promise.all([
    db().select({ id: shopStaff.id }).from(shopStaff).where(eq(shopStaff.userId, userId)).limit(1),
    db()
      .select({ id: adminMembers.userId })
      .from(adminMembers)
      .where(eq(adminMembers.userId, userId))
      .limit(1),
    db()
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
      .limit(1),
  ]);
  if (admin.length > 0) return "admin";
  return staff.length > 0 || credential.length > 0 ? "staff" : null;
}

export async function isPrivilegedUser(userId: string): Promise<boolean> {
  return (await privilegedKind(userId)) !== null;
}

/** The staff/admin account behind an email, or null (no such user, or a customer). */
export async function privilegedUserByEmail(
  email: string,
): Promise<{ id: string; email: string; kind: "admin" | "staff" } | null> {
  // lower(email) matches users_email_lower_uq: raw inserts may keep mixed case, and this check must not fail open.
  const normalized = email.trim().toLowerCase();
  const [user] = await db()
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);
  if (!user) return null;
  const kind = await privilegedKind(user.id);
  return kind ? { id: user.id, email: user.email, kind } : null;
}

/** Same check by email, for flows that start before there is a session (email links). */
export async function isPrivilegedEmail(email: string): Promise<boolean> {
  return (await privilegedUserByEmail(email)) !== null;
}

/**
 * Whether a session has outlived its role's limit (admin 2 h, staff 12 h; customers never). Only sessions older
 * than the shortest limit need a role lookup, so most requests cost nothing extra.
 */
export async function sessionPastRoleLimit(
  userId: string,
  createdAt: Date,
  now: number = Date.now(),
): Promise<boolean> {
  const age = now - createdAt.getTime();
  if (age <= ADMIN_SESSION_MAX_MS) return false;
  const kind = await privilegedKind(userId);
  if (kind === "admin") return true;
  return kind === "staff" && age > STAFF_SESSION_MAX_MS;
}
