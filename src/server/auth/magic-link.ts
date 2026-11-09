import "server-only";
import { after } from "next/server";
import { renderMagicLinkEmail } from "@/server/emails/MagicLinkEmail";
import { sendEmail } from "@/server/integrations/email";
import { log } from "@/server/log";
import { emailKey } from "@/server/security/email-key";
import { ipKey, limit, userKey } from "@/server/security/rate-limit";
import { verifyTurnstile } from "@/server/security/turnstile";
import { isPrivilegedEmail } from "./privileged";

/**
 * Customer sign-in link (P0-06, SECURITY §6).
 *
 * Request checks: Turnstile, then 5/hour per email and 20/hour per IP. The email is keyed by an HMAC, so no
 * address is written to Redis. The IP limit is skipped when there is no real client IP (local/test,
 * TRUSTED_PROXY=none: every request would share one bucket).
 *
 * Delivery runs after the response is sent (`after()`), including the staff/admin check, so a known,
 * unknown or staff address gets the same response in the same time. It is not queued: the raw token would
 * then sit in Redis, which defeats hashed token storage.
 */
export const MAGIC_LINK_LIMITS = {
  perEmail: { max: 5, windowSec: 60 * 60 },
  perIp: { max: 20, windowSec: 60 * 60 },
} as const;

export type CheckResult = { ok: true } | { ok: false; status: 400 | 429; message: string };

export async function checkMagicLinkRequest(input: {
  email: string;
  ip: string;
  turnstileToken: string | null;
}): Promise<CheckResult> {
  const human = await verifyTurnstile(input.turnstileToken, input.ip);
  if (!human.ok) {
    return {
      ok: false,
      status: 400,
      message: "Please complete the security check and try again.",
    };
  }
  const tooMany: CheckResult = {
    ok: false,
    status: 429,
    message: "Too many sign-in links requested. Please wait a while and try again.",
  };
  if (input.ip !== "local" && input.ip !== "unknown") {
    const byIp = await limit({ key: ipKey("magic-link", input.ip), ...MAGIC_LINK_LIMITS.perIp });
    if (!byIp.ok) return tooMany;
  }
  const byEmail = await limit({
    key: userKey("magic-link", emailKey(input.email)),
    ...MAGIC_LINK_LIMITS.perEmail,
  });
  return byEmail.ok ? { ok: true } : tooMany;
}

async function deliver(email: string, url: string): Promise<void> {
  try {
    // Staff/admins never get email links (audit security #1); they sign in with password + 2FA.
    if (await isPrivilegedEmail(email)) return;
    await sendEmail({ kind: "magic-link", to: email, ...(await renderMagicLinkEmail(url)) });
  } catch (err) {
    log().error({ err }, "magic-link delivery failed");
  }
}

/** Sends after the response; outside a Next request (scripts, tests) it runs detached. */
export function deliverMagicLink(email: string, url: string): void {
  try {
    after(() => deliver(email, url));
  } catch {
    void deliver(email, url);
  }
}
