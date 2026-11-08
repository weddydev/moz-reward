import { TOTP } from "otpauth";
import { newId } from "@/lib/id";
import { auth } from "@/server/auth/auth";
import { hashPassword } from "@/server/auth/password";

export const TEST_PASSWORD = "correct-horse-battery-staple-42";

/** Unique, obviously-fake email per test run (never real personal data). */
export const testEmail = (label: string) => `${label}.${newId().slice(-12)}@test.moz.invalid`;

/** Creates a staff/admin-style user with an email+password credential (sign-up is disabled publicly). */
export async function createPasswordUser(
  opts: { email?: string; name?: string; password?: string } = {},
) {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    {
      email: opts.email ?? testEmail("staff"),
      name: opts.name ?? "Test Staff",
      emailVerified: true,
    },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await hashPassword(opts.password ?? TEST_PASSWORD),
  });
  return user;
}

/** Current TOTP code for an otpauth:// URI returned by twoFactor.enable. */
export function totpFromUri(uri: string): string {
  const url = new URL(uri);
  const secret = url.searchParams.get("secret");
  if (!secret) throw new Error("TOTP URI has no secret");
  return new TOTP({ secret, digits: 6, period: 30 }).generate();
}

/** Turns a Set-Cookie response into a Cookie request header. */
export function cookieHeaderFrom(res: Response | Headers): Headers {
  const h = res instanceof Response ? res.headers : res;
  const cookies = h
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
  return new Headers({ cookie: cookies, origin: "http://localhost:3000" });
}
