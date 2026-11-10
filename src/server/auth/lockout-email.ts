import "server-only";
import { londonDay } from "@/lib/format-date";
import { systemScope } from "@/server/authz/scope";
import { type LockoutReason, renderStaffLockoutEmail } from "@/server/emails/StaffLockoutEmail";
import { sendEmail } from "@/server/integrations/email";
import { log } from "@/server/log";
import { lockoutEmailAllowed } from "@/server/ops/alerts";
import { userEmailById } from "@/server/repos/users";
import { privilegedKind } from "./privileged";

const SCOPE = systemScope(
  "job email:staff-lockout: read the locked account's address at send time",
);

/**
 * Job `email:staff-lockout` (P0-18; first outbox producer): the owner of a locked staff/admin account is told
 * by email. The payload holds the user id only; the address is read here, at send time, so a job never
 * carries personal data. A deleted account, or one no longer staff/admin, gets no mail (logged, not failed:
 * retrying would not change the answer).
 */
export async function sendStaffLockoutEmail(userId: string, reason: LockoutReason): Promise<void> {
  const email = await userEmailById(SCOPE, userId);
  const kind = email ? await privilegedKind(userId, SCOPE) : null;
  if (!email || !kind) {
    log().warn(
      { job: "email:staff-lockout", userId, found: email !== null },
      "lockout email skipped: account gone or no longer staff/admin",
    );
    return;
  }
  // C-31: at most LOCKOUT_EMAILS_PER_DAY per account per UK day (a sustained attack must not flood the
  // owner's inbox or our email quota); the security alert to the developers is not capped by this.
  if (!(await lockoutEmailAllowed(userId, londonDay(new Date())))) {
    log().warn({ job: "email:staff-lockout", userId }, "lockout email skipped: daily cap reached");
    return;
  }
  await sendEmail({ kind: "staff-lockout", to: email, ...(await renderStaffLockoutEmail(reason)) });
}
