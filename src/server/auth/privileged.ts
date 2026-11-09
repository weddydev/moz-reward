import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { accounts, adminMembers, shopStaff, users } from "@/server/db/schema";

/**
 * Staff, admins and anyone with a password credential (only staff/admins have one: public sign-up is off).
 * Inactive staff rows count too, so a suspended member can't fall back to a customer-style sign-in.
 */
export async function isPrivilegedUser(userId: string): Promise<boolean> {
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
  return staff.length > 0 || admin.length > 0 || credential.length > 0;
}

/** Same check by email, for flows that start before there is a session (email links). */
export async function isPrivilegedEmail(email: string): Promise<boolean> {
  // lower(email) matches users_email_lower_uq: raw inserts may keep mixed case, and this check must not fail open.
  const normalized = email.trim().toLowerCase();
  const [user] = await db()
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);
  return user ? isPrivilegedUser(user.id) : false;
}
