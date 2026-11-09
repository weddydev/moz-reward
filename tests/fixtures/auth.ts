import { TOTP } from "otpauth";
import { TEST_PASSWORD, fakeEmail, makeUser } from "./factories";

export { TEST_PASSWORD };

/** Unique, obviously-fake email per test (never real personal data). */
export const testEmail = (label: string): string => fakeEmail(label);

/** A staff/admin-style user with an email+password credential (public sign-up is disabled). */
export const createPasswordUser = (
  opts: { email?: string; name?: string; password?: string } = {},
) => makeUser({ ...opts, name: opts.name ?? "Test Staff" });

/** Current TOTP code for an otpauth:// URI returned by twoFactor.enable. */
export function totpFromUri(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret");
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
