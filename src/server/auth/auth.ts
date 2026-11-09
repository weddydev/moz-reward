import "server-only";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink, testUtils, twoFactor } from "better-auth/plugins";
import { newId } from "@/lib/id";
import { TURNSTILE_HEADER } from "@/lib/turnstile";
import { ADMIN_SESSION_MAX_MS, STAFF_SESSION_MAX_MS } from "@/server/authz/policies";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { env } from "@/server/env";
import { checkBreachedPassword } from "@/server/integrations/breach";
import { clientIp } from "@/server/security/request";
import { recordAudit } from "@/server/services/audit";
import { authCookieOptions } from "./cookies";
import { betterAuthIpOptions } from "./ip";
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
import { googleProviderOptions, socialSignUpAllowed } from "./social";
import {
  checkSecondFactor,
  checkStaffLogin,
  clearStaffLoginFailures,
  recordStaffLoginFailure,
} from "./staff-login";

/** Second-factor endpoints (sign-in challenge and enrolment): rate limited per IP. */
const SECOND_FACTOR_PATHS = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);

/** Endpoints that set a password, and the body field carrying it (breached-password check). */
const PASSWORD_SET_PATHS: Record<string, "password" | "newPassword"> = {
  "/sign-up/email": "password",
  "/change-password": "newPassword",
  "/reset-password": "newPassword",
};

const bodyEmail = (body: unknown): string => {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email : "";
};

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
    baseURL: e.APP_URL,
    secret: e.AUTH_SECRET,
    trustedOrigins: [e.APP_URL],
    database: drizzleAdapter(db(), { provider: "pg", schema, usePlural: true }),
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
            await recordAudit(db(), {
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
            throw new APIError(check.status === 429 ? "TOO_MANY_REQUESTS" : "BAD_REQUEST", {
              message: check.message,
            });
          }
          return;
        }
        if (ctx.path === "/sign-in/email" && ctx.request) {
          // Staff/admin password sign-in (customers have no passwords): per-IP limit + per-account backoff.
          const check = await checkStaffLogin({
            email: bodyEmail(ctx.body),
            ip: clientIp(ctx.request.headers),
          });
          if (!check.ok) throw new APIError("TOO_MANY_REQUESTS", { message: check.message });
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
          const check = await checkSecondFactor(clientIp(ctx.request.headers));
          if (!check.ok) throw new APIError("TOO_MANY_REQUESTS", { message: check.message });
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
        if (ctx.path !== "/sign-in/email" || !ctx.request) return;
        const email = bodyEmail(ctx.body);
        const returned: unknown = ctx.context.returned;
        if (returned instanceof APIError) {
          // Wrong email or password (same 401 for both). Other errors (e.g. our 429) are not failures.
          if (returned.statusCode === 401) await recordStaffLoginFailure({ email });
          return;
        }
        // Correct password (signed in, or sent on to the second factor): forget earlier failures.
        await clearStaffLoginFailures(email);
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
        sendMagicLink: ({ email, url }) => {
          deliverMagicLink(email, url);
        },
      }),
      twoFactor({ issuer: "Moz Rewards" }),
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
