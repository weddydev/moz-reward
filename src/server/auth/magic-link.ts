import "server-only";
import { after } from "next/server";
import { renderMagicLinkEmail } from "@/server/emails/MagicLinkEmail";
import { sendEmail } from "@/server/integrations/email";
import { log } from "@/server/log";
import { emailKey } from "@/server/security/email-key";
import { ipLimit, limit, userKey } from "@/server/security/rate-limit";
import { isTurnstileOutage, verifyTurnstile } from "@/server/security/turnstile";
import { isPrivilegedEmail } from "./privileged";

/**
 * Customer sign-in link (P0-06, SECURITY §6).
 *
 * Request checks: Turnstile, then 5/hour per email and 20/hour per IP (fail closed if Redis is down). During a
 * Cloudflare outage the request goes ahead without the check under extra limits (2/hour per email, 5 per IP). The email is keyed by an HMAC, so no
 * address is written to Redis. The IP limit follows `ipLimit`: skipped for "local" (local/test,
 * TRUSTED_PROXY=none: every request would share one bucket); an "unknown" IP shares one strict bucket.
 *
 * Delivery runs after the response is sent (`after()`), including the staff/admin check, so a known,
 * unknown or staff address gets the same response in the same time. It is not queued: the raw token would
 * then sit in Redis, which defeats hashed token storage.
 */
export const MAGIC_LINK_LIMITS = {
  perEmail: { max: 5, windowSec: 60 * 60 },
  perIp: { max: 20, windowSec: 60 * 60 },
  /** Extra limits while Cloudflare Turnstile is down (no bot check): customers can still sign in, slowly. */
  degraded: {
    perEmail: { max: 2, windowSec: 60 * 60 },
    perIp: { max: 5, windowSec: 60 * 60 },
  },
} as const;

export type CheckResult = { ok: true } | { ok: false; status: 400 | 429 | 503; message: string };

export async function checkMagicLinkRequest(input: {
  email: string;
  ip: string;
  turnstileToken: string | null;
}): Promise<CheckResult> {
  const human = await verifyTurnstile(input.turnstileToken, input.ip);
  // SECURITY §6 / P0-19 edge case: a Cloudflare outage must not lock customers out. Their link request goes
  // ahead under stricter limits on top of the normal ones (staff sign-in is denied instead: staff-login.ts).
  const degraded = !human.ok && isTurnstileOutage(human.reason);
  if (!human.ok && !degraded) {
    return {
      ok: false,
      status: 400,
      message: "Please complete the security check and try again.",
    };
  }
  if (!human.ok) {
    // Only an outage gets here (anything else returned above).
    log().warn({ reason: human.reason }, "turnstile outage: sign-in link under degraded limits");
  }
  const tooMany: CheckResult = {
    ok: false,
    status: 429,
    message: "Too many sign-in links requested. Please wait a while and try again.",
  };
  const unavailable: CheckResult = {
    ok: false,
    status: 503,
    message: "Sign-in is briefly unavailable. Please try again in a minute.",
  };
  const email = emailKey(input.email);
  const checks = [
    ipLimit("magic-link", input.ip, MAGIC_LINK_LIMITS.perIp),
    { key: userKey("magic-link", email), ...MAGIC_LINK_LIMITS.perEmail },
    ...(degraded
      ? [
          ipLimit("magic-link-degraded", input.ip, MAGIC_LINK_LIMITS.degraded.perIp),
          { key: userKey("magic-link-degraded", email), ...MAGIC_LINK_LIMITS.degraded.perEmail },
        ]
      : []),
  ];
  for (const check of checks) {
    if (!check) continue; // "local": no per-IP limit
    // Auth limits fail CLOSED when Redis is down (SECURITY §6).
    const result = await limit({ ...check, onError: "closed" });
    if (!result.ok) return result.degraded ? unavailable : tooMany;
  }
  return { ok: true };
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
