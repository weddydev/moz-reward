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

/**
 * Follows an emailed sign-in link the way a person does (P0-19): the link opens the confirm page, which
 * consumes nothing; pressing "Sign in" POSTs the token to the confirm route. Returns that route's 303
 * (Location + session Set-Cookie on success).
 */
export async function confirmSignInLink(
  link: string,
  opts: { origin?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  const { POST } = await import("@/app/api/sign-in/confirm/route");
  const url = new URL(link);
  const form = new FormData();
  form.set("token", url.searchParams.get("token") ?? "");
  form.set("returnTo", url.searchParams.get("returnTo") ?? "");
  return POST(
    new Request(`${url.origin}/api/sign-in/confirm`, {
      method: "POST",
      headers: { origin: opts.origin ?? url.origin, ...opts.headers },
      body: form,
    }),
  );
}
