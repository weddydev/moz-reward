import "server-only";
import { after } from "next/server";
import { renderStaffLockoutEmail } from "@/server/emails/StaffLockoutEmail";
import { sendEmail } from "@/server/integrations/email";
import { log } from "@/server/log";
import { emailKey } from "@/server/security/email-key";
import { ipKey, limit, limiterKey, limiterRedis } from "@/server/security/rate-limit";
import { isPrivilegedEmail } from "./privileged";
import type { CheckResult } from "./magic-link";

/**
 * Staff/admin password sign-in throttling (P0-06, SECURITY §6): 10 attempts per 15 minutes per IP, plus a
 * per-account backoff. After 5 wrong passwords the account is paused for 1 minute, doubling with each further
 * failure up to 15 minutes; a successful sign-in clears it. Failures are counted for unknown addresses too,
 * so the responses never reveal whether an account exists. When the pause starts, the account owner (if it
 * is a real staff/admin account) gets one email.
 */
export const STAFF_LOGIN = {
  perIp: { max: 10, windowSec: 15 * 60 },
  secondFactorPerIp: { max: 10, windowSec: 15 * 60 },
  lockAfter: 5,
  baseLockSec: 60,
  maxLockSec: 15 * 60,
  /** Failures older than this are forgotten. */
  memorySec: 60 * 60,
} as const;

const failKey = (email: string): string => limiterKey(`staff-login:fail:${emailKey(email)}`);
const realIp = (ip: string): boolean => ip !== "local" && ip !== "unknown";

function lockSeconds(failures: number): number {
  if (failures < STAFF_LOGIN.lockAfter) return 0;
  const doubled = STAFF_LOGIN.baseLockSec * 2 ** (failures - STAFF_LOGIN.lockAfter);
  return Math.min(STAFF_LOGIN.maxLockSec, doubled);
}

const tooMany = (minutes: number): CheckResult => ({
  ok: false,
  status: 429,
  message: `Too many attempts. Please wait ${String(minutes)} minute${minutes === 1 ? "" : "s"} and try again.`,
});

export async function checkStaffLogin(input: {
  email: string;
  ip: string;
  now?: number;
}): Promise<CheckResult> {
  const now = input.now ?? Date.now();
  if (realIp(input.ip)) {
    const byIp = await limit({ key: ipKey("staff-login", input.ip), ...STAFF_LOGIN.perIp, now });
    if (!byIp.ok) return tooMany(Math.ceil(STAFF_LOGIN.perIp.windowSec / 60));
  }
  const record = await limiterRedis().hmget(failKey(input.email), "count", "last");
  const failures = Number(record[0] ?? 0);
  const lockedUntil = Number(record[1] ?? 0) + lockSeconds(failures) * 1000;
  if (failures >= STAFF_LOGIN.lockAfter && now < lockedUntil) {
    return tooMany(Math.max(1, Math.ceil((lockedUntil - now) / 60_000)));
  }
  return { ok: true };
}

/** Second-factor attempts (TOTP / backup code) per IP; the account is already known to the challenge. */
export async function checkSecondFactor(ip: string): Promise<CheckResult> {
  if (!realIp(ip)) return { ok: true };
  const byIp = await limit({ key: ipKey("staff-2fa", ip), ...STAFF_LOGIN.secondFactorPerIp });
  return byIp.ok ? { ok: true } : tooMany(Math.ceil(STAFF_LOGIN.secondFactorPerIp.windowSec / 60));
}

export async function recordStaffLoginFailure(input: {
  email: string;
  now?: number;
}): Promise<{ failures: number }> {
  const key = failKey(input.email);
  const [[, count]] = (await limiterRedis()
    .multi()
    .hincrby(key, "count", 1)
    .hset(key, "last", String(input.now ?? Date.now()))
    .expire(key, STAFF_LOGIN.memorySec)
    .exec()) as [[Error | null, number]];
  if (count === STAFF_LOGIN.lockAfter) notifyLockout(input.email);
  return { failures: count };
}

export async function clearStaffLoginFailures(email: string): Promise<void> {
  await limiterRedis().del(failKey(email));
}

function notifyLockout(email: string): void {
  const send = async (): Promise<void> => {
    try {
      if (!(await isPrivilegedEmail(email))) return;
      await sendEmail({ kind: "staff-lockout", to: email, ...(await renderStaffLockoutEmail()) });
    } catch (err) {
      log().error({ err }, "staff lockout email failed");
    }
  };
  try {
    after(send);
  } catch {
    void send();
  }
}
