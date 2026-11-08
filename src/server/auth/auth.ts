import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned, magicLink, twoFactor } from "better-auth/plugins";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { env } from "@/server/env";
import { sendEmail } from "@/server/integrations/email";
import { newId } from "@/lib/id";

const e = env();
const appUrl = new URL(e.APP_URL);

export const auth = betterAuth({
  appName: "Moz Rewards",
  baseURL: e.APP_URL,
  secret: e.AUTH_SECRET,
  database: drizzleAdapter(db(), { provider: "pg", schema, usePlural: true }),
  advanced: {
    database: { generateId: () => newId() },
    cookiePrefix: "moz",
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // customers: 30 days (staff/admin limits enforced in server/authz)
    updateAge: 60 * 60 * 24,
    additionalFields: {
      // true only when the session was created by a 2FA (TOTP/backup code) or passkey verification.
      mfaVerified: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  emailAndPassword: {
    // Staff/admin only. Public sign-up is disabled: staff accounts are created from invites.
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
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
      disableSignUp: false,
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
    haveIBeenPwned(),
    nextCookies(), // must stay last
  ],
});

export type Auth = typeof auth;
