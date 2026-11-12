import "server-only";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { deleteSessionCookie, setSessionCookie } from "better-auth/cookies";
import { nextCookies } from "better-auth/next-js";
import { magicLink, testUtils, twoFactor } from "better-auth/plugins";
import { newId } from "@/lib/id";
import { confirmPageUrl } from "@/lib/sign-in-link";
import { TURNSTILE_HEADER } from "@/lib/turnstile";
import { ADMIN_SESSION_MAX_MS, STAFF_SESSION_MAX_MS } from "@/server/authz/policies";
import { dbAs } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { env } from "@/server/env";
import { checkBreachedPassword } from "@/server/integrations/breach";
import { log } from "@/server/log";
import { activeShopCookie } from "@/server/portal/active-shop";
import { clientIp } from "@/server/security/request";
import { recordAudit } from "@/server/services/audit";
import {
  ADMIN_IP_DENIED_REASON,
  adminIpDenied,
  auditAdminSessionDenied,
  offList,
  offListAdminSession,
  offListAdminSignIn,
  unmatchablePassword,
} from "./admin-ip";
import { authCookieOptions } from "./cookies";
import { betterAuthIpOptions } from "./ip";
import { betterAuthLogger } from "./logger";
import { checkMagicLinkRequest, deliverMagicLink } from "./magic-link";
import {
  PASSKEY_REGISTRATION_PATHS,
  PRIVILEGED_FORBIDDEN_PATHS,
  isMfaSessionPath,
  isPrivilegedAlwaysPath,
  privilegedRequestAllowed,
  privilegedSessionAllowed,
} from "./mfa";
import { hashPassword, verifyPassword } from "./password";
import { isPrivilegedUser, privilegedKind } from "./privileged";
import { DISABLED_PATHS } from "./routes";
import { googleProviderOptions, socialSignUpAllowed } from "./social";
import {
  type AttemptOutcome,
  beginSecondFactor,
  beginStaffLogin,
  finishSecondFactor,
  finishStaffLogin,
  type GuardFailure,
} from "./staff-login";
import type { Reservation } from "./attempt-guard";

/**
 * Second-factor endpoints: limited per IP, and per user when the user is known before the check (TOTP and
 * backup codes, via the session or the two_factor cookie). Passkey sign-in names no user until the assertion
 * is verified, so it gets the per-IP limit only (a WebAuthn signature can't be guessed; SECURITY §2).
 */
const SECOND_FACTOR_PATHS = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/passkey/verify-authentication",
]);
/** The two-factor plugin's pending-sign-in cookie (better-auth/plugins/two-factor/constant). */
const TWO_FACTOR_COOKIE = "two_factor";

/**
 * Attempts reserved by the `before` hook, settled by the `after` hook of the same request (P0-19). Keyed by
 * the Request object, which both hooks share; a request that never reaches `after` is garbage-collected and
 * its reservation simply stays counted (fail safe).
 */
type PendingAttempt =
  | {
      kind: "password";
      email: string;
      ip: string;
      reservation: Reservation;
      deniedBy?: string | undefined;
    }
  | { kind: "second-factor"; userId: string; ip: string; reservation: Reservation };
const pendingAttempts = new WeakMap<Request, PendingAttempt>();

/** 401 = wrong credential; any other error = the credential was not judged; no error = correct. */
function attemptOutcome(returned: unknown): AttemptOutcome {
  if (returned instanceof APIError) return returned.statusCode === 401 ? "failed" : "aborted";
  return "succeeded";
}

function guardError(failure: GuardFailure): APIError {
  const status =
    failure.status === 429
      ? "TOO_MANY_REQUESTS"
      : failure.status === 503
        ? "SERVICE_UNAVAILABLE"
        : "BAD_REQUEST";
  return new APIError(
    status,
    { code: failure.code, message: failure.message },
    failure.retryAfterSec ? { "Retry-After": String(failure.retryAfterSec) } : {},
  );
}

/** Endpoints that set a password, and the body field carrying it (breached-password check). */
const PASSWORD_SET_PATHS: Record<string, "password" | "newPassword"> = {
  "/sign-up/email": "password",
  "/change-password": "newPassword",
  "/reset-password": "newPassword",
};

/** The request headers a database hook runs under, or null (server-side calls without a request). */
function hookHeaders(
  ctx: { request?: Request | undefined; headers?: Headers | undefined } | null | undefined,
): Headers | null {
  return ctx?.request?.headers ?? ctx?.headers ?? null;
}

const bodyEmail = (body: unknown): string => {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email : "";
};

/** Why an /update-user body is refused, or null. Only `name` (1–80 characters after trimming) is accepted. */
export function updateUserProblem(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Nothing to update.";
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "name") return "Only your name can be changed here.";
  const { name } = body as { name: unknown };
  if (typeof name !== "string") return "Enter your name.";
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80)
    return "Use between 1 and 80 characters for your name.";
  return null;
}

export const SESSION_MAX_AGE = {
  customer: 60 * 60 * 24 * 30, // 30 days
  staff: 60 * 60 * 12, // 12 h (enforced in server/authz)
  admin: 60 * 60 * 2, // 2 h (enforced in server/authz)
} as const;

/**
 * Built on first use, not at import: `next build` imports this module while collecting route config, and the
 * production image is built without runtime secrets (P0-14). The server env is still validated at boot
 * (src/instrumentation.ts), so a bad config fails at startup, not on the first request.
 */
function createAuth() {
  const e = env();
  const appUrl = new URL(e.APP_URL);
  /** Better Auth test utilities exist only in the test environment (never local/staging/production). */
  const isTest = e.APP_ENV === "test";
  return betterAuth({
    appName: "Moz Rewards",
    // P0-13 (C-03): the library's logs go through pino (redaction, JSON); its errors to Sentry.
    logger: betterAuthLogger(),
    baseURL: e.APP_URL,
    secret: e.AUTH_SECRET,
    trustedOrigins: [e.APP_URL],
    // OAuth state/callback failures land on our sign-in page (it shows the Google message), not the library's
    // bare /error page, which is blocked (routes.ts).
    onAPIError: { errorURL: `${e.APP_URL}/sign-in` },
    // Second layer behind the route allowlist (src/server/auth/routes.ts): unused endpoints answer 404.
    disabledPaths: [...DISABLED_PATHS],
    database: drizzleAdapter(dbAs("auth"), { provider: "pg", schema, usePlural: true }),
    advanced: {
      database: { generateId: () => newId() },
      ...authCookieOptions(e.APP_URL),
      ipAddress: betterAuthIpOptions(e.TRUSTED_PROXY),
    },
    // Better Auth's built-in limiter is off: it is in-memory per process, production-only, and keyed by its own
    // IP reading. SECURITY §6 limits are ours, in Redis: sign-in links (magic-link.ts), staff password and second
    // factor (staff-login.ts), actions (actionTemplate). Without this, staging allowed 5 link requests/min per
    // IP across all users (P0-B QA). Every other Better Auth endpoint needs a session (and the staff gate).
    rateLimit: { enabled: false },
    session: {
      expiresIn: SESSION_MAX_AGE.customer,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        // true only when the session was created by a 2FA (TOTP/backup code) or passkey verification.
        mfaVerified: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    // One user per verified email: Google and magic link resolve to the same user. Implicit linking needs the
    // provider's email_verified *and* a verified local user; no provider is trusted to skip that (DECISIONS).
    account: { accountLinking: { enabled: true, trustedProviders: [] } },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            if (!socialSignUpAllowed({ path: ctx?.path, emailVerified: user.emailVerified })) {
              throw new APIError("FORBIDDEN", {
                message:
                  "Please use a Google account with a verified email address, or sign in by email.",
              });
            }
            return { data: user };
          },
        },
      },
      session: {
        create: {
          before: async (session, ctx) => {
            // Staff/admins: password + second factor only. Email links, Google and anything else are refused
            // even if a link was issued before the account became staff (audit security #1).
            if (
              !privilegedSessionAllowed(ctx?.path, { testEnv: isTest }) &&
              (await isPrivilegedUser(session.userId))
            ) {
              throw new APIError("FORBIDDEN", {
                message:
                  "Staff and admin accounts sign in with a password and two-step verification.",
              });
            }
            // C-24: no admin session from outside the admin IP allowlist (covers passkey sign-in).
            const offListAdmin = await offListAdminSession(session.userId, hookHeaders(ctx));
            if (offListAdmin) {
              adminIpDenied(session.userId, offListAdmin.ip, "session");
              await auditAdminSessionDenied(session.userId, offListAdmin.ip);
              throw new APIError("UNAUTHORIZED", { message: "Invalid email or password" });
            }
            // A second-factor path counts only in the sign-in challenge, which runs with no session yet.
            // The same endpoint during enrolment runs inside a (password-only) session; counting that would let
            // someone holding just the password enrol their own app and get an MFA session (audit security #5).
            const enrolling =
              isMfaSessionPath(ctx?.path) && ctx ? (await getSessionFromCtx(ctx)) !== null : false;
            return {
              data: { ...session, mfaVerified: isMfaSessionPath(ctx?.path) && !enrolling },
            };
          },
          // SECURITY §12: staff/admin sign-ins are audit-logged. Only the MFA-verified session is a sign-in;
          // the password step alone is not (failures are throttled and counted in staff-login.ts).
          after: async (session) => {
            if (session.mfaVerified !== true) return;
            const kind = await privilegedKind(session.userId);
            if (!kind) return;
            await recordAudit(dbAs("auth"), {
              actorId: session.userId,
              actorRole: kind,
              action: "auth.sign_in",
              entity: "session",
              entityId: session.id,
              ip: session.ipAddress || null,
            });
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Staff/admin sessions: Better Auth's own account endpoints obey the same MFA and role-age rules as our
        // actions (audit security #8). Customers and signed-out callers are not affected.
        if (!isPrivilegedAlwaysPath(ctx.path)) {
          const current = await getSessionFromCtx(ctx);
          const kind = current ? await privilegedKind(current.user.id) : null;
          if (
            current &&
            kind &&
            !privilegedRequestAllowed({
              path: ctx.path,
              mfaVerified: current.session.mfaVerified === true,
              sessionAgeMs: Date.now() - new Date(current.session.createdAt).getTime(),
              maxAgeMs: kind === "admin" ? ADMIN_SESSION_MAX_MS : STAFF_SESSION_MAX_MS,
            })
          ) {
            throw new APIError("FORBIDDEN", {
              message: "For your security, please sign in again with two-step verification.",
            });
          }
          // C-24: a signed-in admin from outside the allowlist can't use the account endpoints either.
          const off = current && kind === "admin" ? offList(ctx.request?.headers ?? null) : null;
          if (current && off) {
            adminIpDenied(current.user.id, off.ip, "account");
            throw new APIError("FORBIDDEN", { message: "You don't have access to this." });
          }
        }
        if (ctx.path === "/update-user") {
          // Only a display name may change here (P0-19): bounded, no other field (email, image, roles…).
          const problem = updateUserProblem(ctx.body);
          if (problem) throw new APIError("BAD_REQUEST", { message: problem });
        }
        if (ctx.path === "/sign-in/magic-link" && ctx.request) {
          // Browser requests only: server code calling auth.api directly is trusted (SECURITY §6 limits).
          const body = ctx.body as { email?: unknown } | undefined;
          const check = await checkMagicLinkRequest({
            email: typeof body?.email === "string" ? body.email : "",
            ip: clientIp(ctx.request.headers),
            turnstileToken: ctx.request.headers.get(TURNSTILE_HEADER),
          });
          if (!check.ok) {
            throw new APIError(
              check.status === 429
                ? "TOO_MANY_REQUESTS"
                : check.status === 503
                  ? "SERVICE_UNAVAILABLE"
                  : "BAD_REQUEST",
              { message: check.message },
              check.status === 503 ? { "Retry-After": "60" } : {},
            );
          }
          return;
        }
        if (ctx.path === "/sign-in/email" && ctx.request) {
          // Staff/admin password sign-in (customers have no passwords): per-IP limit, per account + IP backoff,
          // Turnstile once the account is past its failure limit (staff-login.ts).
          const email = bodyEmail(ctx.body);
          const ip = clientIp(ctx.request.headers);
          const guard = await beginStaffLogin({
            email,
            ip,
            turnstileToken: ctx.request.headers.get(TURNSTILE_HEADER),
          });
          if (!guard.ok) throw guardError(guard);
          // C-24: an admin email from outside the allowlist fails exactly like a wrong password.
          const offListAdmin = await offListAdminSignIn(email, ctx.request.headers);
          if (guard.reservation) {
            pendingAttempts.set(ctx.request, {
              kind: "password",
              email,
              ip,
              reservation: guard.reservation,
              deniedBy: offListAdmin ? ADMIN_IP_DENIED_REASON : undefined,
            });
          }
          if (offListAdmin) {
            adminIpDenied(offListAdmin.userId, offListAdmin.ip, "password");
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            return { context: { body: { ...body, password: unmatchablePassword() } } };
          }
          return;
        }
        const passwordField = Object.hasOwn(PASSWORD_SET_PATHS, ctx.path)
          ? PASSWORD_SET_PATHS[ctx.path]
          : undefined;
        if (passwordField) {
          // Own k-anonymity check with a timeout that fails open (the library plugin had no timeout and failed closed).
          const value = (ctx.body as Record<string, unknown> | undefined)?.[passwordField];
          if (typeof value === "string" && (await checkBreachedPassword(value)).breached) {
            throw new APIError("BAD_REQUEST", {
              message:
                "This password has appeared in a data breach. Please choose a different one.",
            });
          }
          return;
        }
        if (SECOND_FACTOR_PATHS.has(ctx.path) && ctx.request) {
          const ip = clientIp(ctx.request.headers);
          // The user being verified: the session's (enrolment) or the pending sign-in's (two_factor cookie, the
          // same signed identifier the plugin itself reads). Unknown, or a passkey (no user until verified) → per-IP
          // limit only.
          const perUser = ctx.path !== "/passkey/verify-authentication";
          let userId = perUser ? ((await getSessionFromCtx(ctx))?.user.id ?? null) : null;
          if (perUser && !userId) {
            const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE);
            const identifier = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
            const pending = identifier
              ? await ctx.context.internalAdapter.findVerificationValue(identifier)
              : null;
            userId = pending && pending.expiresAt > new Date() ? pending.value : null;
          }
          const guard = await beginSecondFactor({ ip, userId });
          if (!guard.ok) throw guardError(guard);
          if (guard.reservation && userId) {
            pendingAttempts.set(ctx.request, {
              kind: "second-factor",
              userId,
              ip,
              reservation: guard.reservation,
            });
          }
          return;
        }
        if (PRIVILEGED_FORBIDDEN_PATHS.has(ctx.path)) {
          const current = await getSessionFromCtx(ctx);
          if (current && (await isPrivilegedUser(current.user.id))) {
            throw new APIError("FORBIDDEN", {
              message: "Two-step verification is required for staff and admin accounts.",
            });
          }
          return;
        }
        if (!PASSKEY_REGISTRATION_PATHS.has(ctx.path)) return;
        // A passkey is a second factor, so only a session that already passed MFA may add one (audit security #1).
        const current = await getSessionFromCtx(ctx);
        if (!current?.session.mfaVerified) {
          throw new APIError("FORBIDDEN", {
            message: "Turn on two-step verification before adding a passkey.",
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        // P0-12: the shop portal's active-shop choice goes with the session.
        if (ctx.path === "/sign-out") {
          const shop = activeShopCookie(env().APP_URL);
          ctx.setCookie(shop.name, "", { ...shop.options, maxAge: 0 });
        }
        // Settle the attempt the `before` hook reserved first (none when it refused the request itself), so
        // nothing below can leave it unsettled.
        const pending = ctx.request ? pendingAttempts.get(ctx.request) : undefined;
        if (pending && ctx.request) {
          pendingAttempts.delete(ctx.request);
          // Wrong email or password, or wrong code: 401. A correct password also "succeeds" when it only leads
          // on to the second factor.
          const outcome = attemptOutcome(ctx.context.returned);
          if (pending.kind === "password") await finishStaffLogin({ ...pending, outcome });
          else await finishSecondFactor({ ...pending, outcome });
        }
        // SECURITY §2/§5: a staff/admin session cookie lives no longer than the role's absolute limit (12 h /
        // 2 h from sign-in); the library would give every cookie the customer's 30 days. Covers sign-in, the
        // second factor and refreshes; a session already past its limit gets an expired cookie. A
        // "don't remember me" cookie stays a browser-session cookie (no Max-Age added).
        const issued = ctx.context.newSession;
        if (!issued) return;
        try {
          const kind = await privilegedKind(issued.user.id);
          if (!kind) return;
          const limitMs = kind === "admin" ? ADMIN_SESSION_MAX_MS : STAFF_SESSION_MAX_MS;
          const createdMs = new Date(issued.session.createdAt).getTime();
          const leftSec = Math.floor((createdMs + limitMs - Date.now()) / 1000);
          if (leftSec <= 0) {
            deleteSessionCookie(ctx);
            return;
          }
          const dontRemember = await ctx.getSignedCookie(
            ctx.context.authCookies.dontRememberToken.name,
            ctx.context.secret,
          );
          if (!dontRemember) await setSessionCookie(ctx, issued, undefined, { maxAge: leftSec });
        } catch (err) {
          // The app still enforces the role limit on every request (sessionFromHeaders): log, don't fail sign-in.
          log().error({ err }, "staff session cookie lifetime not applied");
        }
      }),
    },
    emailAndPassword: {
      // Staff/admin only. Public sign-up is disabled: staff accounts are created from invites.
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    socialProviders:
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
        ? {
            google: googleProviderOptions({
              clientId: e.GOOGLE_CLIENT_ID,
              clientSecret: e.GOOGLE_CLIENT_SECRET,
            }),
          }
        : {},
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
        // Only a hash is stored: a database leak can't be turned into sign-ins (SECURITY §2).
        storeToken: "hashed",
        // Delivery (incl. the staff/admin refusal) happens after the response: same answer, same timing.
        // The email links to our confirm page, never to the library's GET verify (mail scanners, P0-19 AC3).
        sendMagicLink: ({ email, url }) => {
          deliverMagicLink(email, confirmPageUrl(url, e.APP_URL));
        },
      }),
      twoFactor({
        issuer: "Moz Rewards",
        // Backstop to our per-user backoff (staff-login.ts, 5 failures): the plugin's own DB-level lock.
        accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 15 * 60 },
      }),
      passkey({
        rpID: appUrl.hostname,
        rpName: "Moz Rewards",
        origin: e.APP_URL,
        // Counts as a second factor only with user verification (PIN/biometric), enforced on register and sign-in (audit #6).
        authenticatorSelection: { userVerification: "required" },
      }),
      ...(isTest ? [testUtils()] : []),
      nextCookies(), // must stay last
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** The process's Better Auth instance, created on first use. */
export const getAuth = (): Auth => (instance ??= createAuth());
