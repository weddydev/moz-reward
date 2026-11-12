import "server-only";
import { randomBytes } from "node:crypto";
import { dbAs } from "@/server/db/client";
import { log } from "@/server/log";
import { adminAccessFrom } from "@/server/security/admin-access";
import { adminAddressAllowed } from "@/server/security/admin-allowlist";
import { securityAlert } from "@/server/security/alert";
import { hashIp, recordAudit } from "@/server/services/audit";
import { adminUserIdByEmail, privilegedKind } from "./privileged";

/**
 * Admin IP allowlist at sign-in (C-24, P0-12 design). The page gates and `requireAdminRole` refuse an off-list
 * admin on every request; these checks keep the session from being made at all:
 * - `/sign-in/email`: an admin email from an off-list address is an ordinary failed password. The before-hook
 *   swaps the submitted password for a random one, so the library answers, times and counts it exactly like a
 *   wrong password (incl. the lockout at the limit). The admin who is also shop staff is refused too.
 * - session creation (covers passkey sign-in and anything else that makes a session) for an admin account.
 * - Better Auth's own account endpoints for a signed-in admin (the request hook in auth.ts).
 * With the list set, an address that isn't a plain IP ("local", "unknown", no headers) is refused.
 */
export const ADMIN_IP_DENIED_REASON = "admin-ip-allowlist";

/** True when this request comes from outside a configured allowlist. */
export function offList(headers: Headers | null): { ip: string } | null {
  const access = adminAccessFrom(headers);
  return access.allowlist && !adminAddressAllowed(access.allowlist, access.ip)
    ? { ip: access.ip }
    : null;
}

/** `/sign-in/email`: the admin account an off-list request names, or null (on-list, no list, not an admin). */
export async function offListAdminSignIn(
  email: string,
  headers: Headers,
): Promise<{ userId: string; ip: string } | null> {
  const off = offList(headers);
  if (!off) return null;
  // Same single query for every email, so the answer's timing doesn't say whether it is an admin's.
  const userId = await adminUserIdByEmail(email);
  return userId ? { userId, ip: off.ip } : null;
}

/** A value no password hash matches: the library then runs its normal wrong-password path. */
export const unmatchablePassword = (): string => randomBytes(48).toString("base64url");

/** Session creation for an admin account from an off-list address. */
export async function offListAdminSession(
  userId: string,
  headers: Headers | null,
): Promise<{ ip: string } | null> {
  const off = offList(headers);
  if (!off) return null;
  return (await privilegedKind(userId)) === "admin" ? off : null;
}

/** Alert both developers (hashed address and user id only). Delivery problems never change the deny. */
export function adminIpDenied(
  userId: string,
  ip: string,
  where: "password" | "session" | "account",
): void {
  try {
    securityAlert("auth.admin_ip_denied", { userId, ipHash: hashIp(ip), where });
  } catch (err) {
    log().error({ err }, "admin IP alert not raised");
  }
}

/** Audit row for a refused session creation (the password path is audited by `finishStaffLogin`). */
export async function auditAdminSessionDenied(userId: string, ip: string): Promise<void> {
  try {
    await recordAudit(dbAs("auth"), {
      actorId: null,
      actorRole: "system",
      action: "auth.sign_in_failed",
      entity: "user",
      entityId: userId,
      meta: { factor: "session", role: "admin", reason: ADMIN_IP_DENIED_REASON },
      ip,
    });
  } catch (err) {
    log().error({ err }, "admin IP audit not written");
  }
}
