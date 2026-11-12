import "server-only";
import { after } from "next/server";
import { TURNSTILE_REQUIRED_CODE } from "@/lib/turnstile";
import { authScope } from "@/server/authz/scope";
import { dbAs } from "@/server/db/client";
import type { LockoutReason } from "@/server/emails/StaffLockoutEmail";
import { writeOutbox } from "@/server/jobs/outbox";
import { log } from "@/server/log";
import { transaction } from "@/server/repos/_base";
import { securityAlert } from "@/server/security/alert";
import { emailKey } from "@/server/security/email-key";
import { ipBucket } from "@/server/security/ip-bucket";
import { ipLimit, limit, limiterKey } from "@/server/security/rate-limit";
import { isTurnstileOutage, verifyTurnstile } from "@/server/security/turnstile";
import { hashIp, recordAudit } from "@/server/services/audit";
import {
  type AttemptSpec,
  AttemptGuardUnavailable,
  clearAttempts,
  type Reservation,
  releaseAttempt,
  reserveAttempt,
} from "./attempt-guard";
import { privilegedKind, privilegedUserByEmail } from "./privileged";

/**
 * Staff/admin sign-in throttling (P0-06, redesigned in P0-19; SECURITY §2 and §6).
 *
 * Password step, checked atomically before the password is verified (`attempt-guard.ts`):
 * - 10 attempts per 15 minutes per IP, across accounts.
 * - Per account + IP: after 5 wrong passwords that source is paused for 1 minute, doubling with each further
 *   failure up to 15 minutes, even if it solves Turnstile.
 * - Per account: after 5 wrong passwords from anywhere, every further attempt must carry a solved Turnstile
 *   check. The account is never shut, so nobody can keep its owner out with one wrong guess every few
 *   minutes; a correct password plus the check signs in.
 * Second factor (TOTP / backup code): 10 per 15 minutes per IP, and per user a backoff after 5 failures
 * (whoever is there already knows the password, so this one locks).
 *
 * Failures are counted for unknown addresses too, so responses never reveal whether an account exists. A
 * correct credential clears the counters. When a lockout starts it raises a security alert, writes an audit
 * row and emails the account owner once. Redis unavailable → 503 (fail closed).
 */
export const STAFF_LOGIN = {
  perIp: { max: 10, windowSec: 15 * 60 },
  secondFactorPerIp: { max: 10, windowSec: 15 * 60 },
  password: { lockAfter: 5, baseLockSec: 60, maxLockSec: 15 * 60, memorySec: 60 * 60 },
  secondFactor: { lockAfter: 5, baseLockSec: 60, maxLockSec: 15 * 60, memorySec: 60 * 60 },
} as const satisfies Record<"password" | "secondFactor", AttemptSpec> & Record<string, unknown>;

export type GuardFailure = {
  ok: false;
  status: 400 | 429 | 503;
  code: "TOO_MANY_ATTEMPTS" | typeof TURNSTILE_REQUIRED_CODE | "UNAVAILABLE";
  message: string;
  retryAfterSec?: number;
};
export type GuardResult = { ok: true; reservation: Reservation | null } | GuardFailure;
/** How the guarded attempt ended: wrong credential, correct credential, or not checked at all. */
export type AttemptOutcome = "failed" | "succeeded" | "aborted";

const accountKey = (email: string): string => limiterKey(`staff-login:acct:${emailKey(email)}`);
const sourceKey = (email: string, ip: string): string =>
  limiterKey(`staff-login:src:${emailKey(email)}:${hashIp(ipBucket(ip))}`);
const secondFactorKey = (userId: string): string => limiterKey(`staff-2fa:user:${userId}`);

function tooMany(retryAfterSec: number): GuardFailure {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return {
    ok: false,
    status: 429,
    code: "TOO_MANY_ATTEMPTS",
    message: `Too many attempts. Please wait ${String(minutes)} minute${minutes === 1 ? "" : "s"} and try again.`,
    retryAfterSec,
  };
}
const UNAVAILABLE: GuardFailure = {
  ok: false,
  status: 503,
  code: "UNAVAILABLE",
  message: "Sign-in is briefly unavailable. Please try again in a minute.",
  retryAfterSec: 60,
};
const challenge = (message: string): GuardFailure => ({
  ok: false,
  status: 400,
  code: TURNSTILE_REQUIRED_CODE,
  message,
});
/** Cloudflare down or no usable secret: privileged sign-in is denied (SECURITY §6 fallback). */
const turnstileDown = (reason: string): boolean =>
  reason === "not-configured" || isTurnstileOutage(reason);

async function perIpCheck(
  scope: string,
  ip: string,
  spec: { max: number; windowSec: number },
  now: number | undefined,
): Promise<GuardFailure | null> {
  const perIp = ipLimit(scope, ip, spec);
  if (!perIp) return null;
  const at = now ?? Date.now();
  const byIp = await limit({ ...perIp, now: at, onError: "closed" });
  if (byIp.ok) return null;
  if (byIp.degraded) return UNAVAILABLE;
  return tooMany(Math.max(1, Math.ceil((byIp.resetAt.getTime() - at) / 1000)));
}

/** Before the password is checked. On `ok`, settle the reservation with `finishStaffLogin`. */
export async function beginStaffLogin(input: {
  email: string;
  ip: string;
  turnstileToken?: string | null;
  now?: number;
}): Promise<GuardResult> {
  const blocked = await perIpCheck("staff-login", input.ip, STAFF_LOGIN.perIp, input.now);
  if (blocked) return blocked;
  const attempt = {
    account: accountKey(input.email),
    source: sourceKey(input.email, input.ip),
    spec: STAFF_LOGIN.password,
    mode: "challenge" as const,
    ...(input.now === undefined ? {} : { now: input.now }),
  };
  try {
    let decision = await reserveAttempt(attempt);
    if (decision.kind === "challenge") {
      if (!input.turnstileToken) {
        return challenge("For your security, please complete the check below, then sign in again.");
      }
      const human = await verifyTurnstile(input.turnstileToken, input.ip);
      if (!human.ok) {
        if (turnstileDown(human.reason)) {
          log().warn({ reason: human.reason }, "staff sign-in refused: security check unavailable");
          return {
            ...UNAVAILABLE,
            message: "We couldn't run the security check. Please try again in a few minutes.",
          };
        }
        return challenge("The security check didn't work. Please try it again.");
      }
      decision = await reserveAttempt({ ...attempt, human: true });
    }
    if (decision.kind === "locked") return tooMany(decision.retryAfterSec);
    if (decision.kind === "challenge") return challenge("Please complete the security check.");
    return { ok: true, reservation: decision.reservation };
  } catch (err) {
    if (err instanceof AttemptGuardUnavailable) return UNAVAILABLE;
    throw err;
  }
}

export async function finishStaffLogin(input: {
  email: string;
  ip: string;
  reservation: Reservation;
  outcome: AttemptOutcome;
  /** Why a correct-looking attempt was turned into a failure (C-24 admin IP allowlist), for the audit row. */
  deniedBy?: string | undefined;
}): Promise<void> {
  const { reservation, outcome } = input;
  if (outcome === "succeeded") return clearAttempts(reservation.keys);
  if (outcome === "aborted") return releaseAttempt(reservation);
  const [accountCount, sourceCount] = reservation.counts;
  auditFailure(() => privilegedUserByEmail(input.email), input.ip, "password", input.deniedBy);
  const { lockAfter } = STAFF_LOGIN.password;
  // Exactly one request reaches each threshold (the counts were reserved atomically): one alert per lockout.
  if (accountCount === lockAfter) {
    lockoutStarted({
      reason: "password",
      scope: "account",
      ip: input.ip,
      tag: emailKey(input.email),
      owner: () => privilegedUserByEmail(input.email), // the job mails the stored address, not the typed one
    });
  }
  if (sourceCount === lockAfter) {
    lockoutStarted({
      reason: "password",
      scope: "account+ip",
      ip: input.ip,
      tag: emailKey(input.email),
    });
  }
}

/** Before a second-factor code is checked. `userId` is the account being verified, when known. */
export async function beginSecondFactor(input: {
  ip: string;
  userId: string | null;
  now?: number;
}): Promise<GuardResult> {
  const blocked = await perIpCheck("staff-2fa", input.ip, STAFF_LOGIN.secondFactorPerIp, input.now);
  if (blocked) return blocked;
  if (!input.userId) return { ok: true, reservation: null };
  try {
    const decision = await reserveAttempt({
      account: secondFactorKey(input.userId),
      spec: STAFF_LOGIN.secondFactor,
      mode: "lock",
      ...(input.now === undefined ? {} : { now: input.now }),
    });
    if (decision.kind === "reserved") return { ok: true, reservation: decision.reservation };
    return decision.kind === "locked"
      ? tooMany(decision.retryAfterSec)
      : tooMany(STAFF_LOGIN.secondFactor.baseLockSec);
  } catch (err) {
    if (err instanceof AttemptGuardUnavailable) return UNAVAILABLE;
    throw err;
  }
}

export async function finishSecondFactor(input: {
  userId: string;
  ip: string;
  reservation: Reservation;
  outcome: AttemptOutcome;
}): Promise<void> {
  const { reservation, outcome } = input;
  if (outcome === "succeeded") return clearAttempts(reservation.keys);
  if (outcome === "aborted") return releaseAttempt(reservation);
  auditFailure(
    async () => {
      const kind = await privilegedKind(input.userId);
      return kind ? { id: input.userId, kind } : null;
    },
    input.ip,
    "second-factor",
  );
  if (reservation.counts[0] !== STAFF_LOGIN.secondFactor.lockAfter) return;
  lockoutStarted({
    reason: "second-factor",
    scope: "account",
    ip: input.ip,
    tag: input.userId,
    owner: async () => {
      const kind = await privilegedKind(input.userId);
      return kind ? { id: input.userId, kind } : null;
    },
  });
}

/** The address is read when the email job runs (lockout-email.ts), so it never sits in a job payload. */
type Owner = { id: string; kind: "admin" | "staff" };

const LOCKOUT_SCOPE = authScope(
  "lockout follow-up: audit row and owner email for a staff/admin account",
);

/**
 * A lockout began: alert now; after the response, audit and email the owner (real staff/admin accounts only,
 * so unknown addresses stay indistinguishable). `tag` is a hash or id, never an email.
 */
function lockoutStarted(input: {
  reason: LockoutReason;
  scope: "account" | "account+ip";
  ip: string;
  tag: string;
  owner?: () => Promise<Owner | null>;
}): void {
  securityAlert("auth.lockout", {
    reason: input.reason,
    scope: input.scope,
    account: input.tag,
    ipHash: hashIp(input.ip),
  });
  const { owner } = input;
  if (!owner) return;
  const work = async (): Promise<void> => {
    try {
      const user = await owner();
      if (!user) return;
      // Audit row and owner email commit together: the email is an outbox row (P0-18), delivered by the
      // relay even if this process dies right after the commit.
      await transaction(LOCKOUT_SCOPE, async (tx) => {
        await recordAudit(tx, {
          actorId: null,
          actorRole: "system",
          action: "auth.lockout",
          entity: "user",
          entityId: user.id,
          meta: { reason: input.reason, scope: input.scope, role: user.kind },
          ip: input.ip,
        });
        await writeOutbox(LOCKOUT_SCOPE, tx, "email", "staff-lockout", {
          userId: user.id,
          reason: input.reason,
        });
      });
    } catch (err) {
      log().error({ err }, "staff lockout follow-up failed");
    }
  };
  try {
    after(work);
  } catch {
    void work();
  }
}

/**
 * SECURITY §2/§12: failed staff/admin sign-ins (wrong password or code) are audit-logged, for real accounts
 * only (unknown addresses
 * leave no row, and the lookup runs after the response so timing reveals nothing).
 */
function auditFailure(
  lookup: () => Promise<{ id: string; kind: "admin" | "staff" } | null>,
  ip: string,
  factor: LockoutReason,
  reason?: string,
): void {
  const work = async (): Promise<void> => {
    try {
      const user = await lookup();
      if (!user) return;
      await recordAudit(dbAs("auth"), {
        actorId: null,
        actorRole: "system",
        action: "auth.sign_in_failed",
        entity: "user",
        entityId: user.id,
        meta: reason ? { factor, role: user.kind, reason } : { factor, role: user.kind },
        ip,
      });
    } catch (err) {
      log().error({ err }, "failed sign-in audit not written");
    }
  };
  try {
    after(work);
  } catch {
    void work();
  }
}
