import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned, magicLink, testUtils, twoFactor } from "better-auth/plugins";
import { newId } from "@/lib/id";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { env } from "@/server/env";
import { sendEmail } from "@/server/integrations/email";
import { isMfaSessionPath } from "./mfa";
import { hashPassword, verifyPassword } from "./password";

const e = env();
const appUrl = new URL(e.APP_URL);
const isLocalOrTest = e.APP_ENV === "local" || e.APP_ENV === "test";

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
        before: async (session, ctx) => ({
          data: { ...session, mfaVerified: isMfaSessionPath(ctx?.path) },
        }),
      },
    },
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
      sendMagicLink: async ({ email, url }) => {
        await sendEmail({
          kind: "magic-link",
          to: email,
          subject: "Your Moz Rewards sign-in link",
          text: `Tap the link below to sign in. It works once and expires in 15 minutes.\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
        });
      },
    }),
    twoFactor({ issuer: "Moz Rewards" }),
    passkey({ rpID: appUrl.hostname, rpName: "Moz Rewards", origin: e.APP_URL }),
    haveIBeenPwned({
      customPasswordCompromisedMessage:
        "This password has appeared in a data breach. Please choose a different one.",
    }),
    ...(isLocalOrTest ? [testUtils()] : []),
    nextCookies(), // must stay last
  ],
});

export type Auth = typeof auth;
