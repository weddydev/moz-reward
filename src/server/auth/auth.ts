import "server-only";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned, magicLink, testUtils, twoFactor } from "better-auth/plugins";
import { newId } from "@/lib/id";
import { TURNSTILE_HEADER } from "@/lib/turnstile";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { env } from "@/server/env";
import { clientIp } from "@/server/security/request";
import { checkMagicLinkRequest, deliverMagicLink } from "./magic-link";
import {
  PASSKEY_REGISTRATION_PATHS,
  PRIVILEGED_FORBIDDEN_PATHS,
  isMfaSessionPath,
  privilegedSessionAllowed,
} from "./mfa";
import { hashPassword, verifyPassword } from "./password";
import { isPrivilegedUser } from "./privileged";

const e = env();
const appUrl = new URL(e.APP_URL);
/** Better Auth test utilities exist only in the test environment (never local/staging/production). */
const isTest = e.APP_ENV === "test";

export const SESSION_MAX_AGE = {
  customer: 60 * 60 * 24 * 30, // 30 days
  staff: 60 * 60 * 12, // 12 h (enforced in server/authz)
  admin: 60 * 60 * 2, // 2 h (enforced in server/authz)
} as const;

export const auth = betterAuth({
  appName: "Moz Rewards",
  baseURL: e.APP_URL,
  secret: e.AUTH_SECRET,
  trustedOrigins: [e.APP_URL],
  database: drizzleAdapter(db(), { provider: "pg", schema, usePlural: true }),
  advanced: {
    database: { generateId: () => newId() },
    cookiePrefix: "moz",
    useSecureCookies: appUrl.protocol === "https:",
  },
  session: {
    expiresIn: SESSION_MAX_AGE.customer,
    updateAge: 60 * 60 * 24,
    additionalFields: {
      // true only when the session was created by a 2FA (TOTP/backup code) or passkey verification.
      mfaVerified: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  databaseHooks: {
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
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
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
          google: {
            clientId: e.GOOGLE_CLIENT_ID,
            clientSecret: e.GOOGLE_CLIENT_SECRET,
            scope: ["openid", "email", "profile"],
          },
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
    haveIBeenPwned({
      customPasswordCompromisedMessage:
        "This password has appeared in a data breach. Please choose a different one.",
    }),
    ...(isTest ? [testUtils()] : []),
    nextCookies(), // must stay last
  ],
});

export type Auth = typeof auth;
