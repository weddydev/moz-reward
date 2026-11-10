import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { type LockoutReason, renderStaffLockoutEmail } from "@/server/emails/StaffLockoutEmail";
import { sendEmail } from "@/server/integrations/email";

/**
 * Job `email:staff-lockout` (P0-18; first outbox producer): the owner of a locked staff/admin account is told
 * by email. The payload holds the user id only; the address is read here, at send time, so a job never
 * carries personal data and a deleted account gets no mail.
 */
export async function sendStaffLockoutEmail(userId: string, reason: LockoutReason): Promise<void> {
  const [user] = await db()
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return;
  await sendEmail({
    kind: "staff-lockout",
    to: user.email,
    ...(await renderStaffLockoutEmail(reason)),
  });
}
