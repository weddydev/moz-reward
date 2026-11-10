import { type APIRequestContext, type APIResponse } from "@playwright/test";
import { TOTP } from "otpauth";
import { clientHeaders, expect, test, testApiHeaders, uniqueEmail } from "./support/test";

/**
 * SECURITY conformance on the production build (P0-19 AC1): what a client actually receives — cookies per
 * role, session limits, the client IP behind the proxy, the §5 headers and the `/api/auth/*` limit. Values
 * are the SECURITY.md ones, written out here on purpose (a library default changing would fail this).
 * The E2E server is plain http, so cookies carry the `moz.` prefix without Secure; the https form
 * (`__Host-moz.`, Secure) is unit-tested in src/server/auth/cookies.test.ts and checked on staging.
 */
const TURNSTILE = { "x-turnstile-token": "local-turnstile-bypass" };
const DAY = 24 * 60 * 60;
const H = 60 * 60 * 1000;

type Cookie = { name: string; maxAge: number | null; attrs: string[] };

/** The last session-token Set-Cookie of a response (browsers apply them in order). */
function sessionCookie(res: APIResponse): Cookie {
  const all = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value)
    .filter((v) => /session_token=/.test(v.split(";")[0] ?? ""));
  const last = all.at(-1);
  if (!last) throw new Error(`no session cookie (status ${String(res.status())})`);
  const [pair = "", ...rest] = last.split(";").map((p) => p.trim());
  const attrs = rest.map((a) => a.toLowerCase());
  const maxAge = attrs.find((a) => a.startsWith("max-age="));
  return {
    name: pair.slice(0, pair.indexOf("=")),
    maxAge: maxAge ? Number(maxAge.slice("max-age=".length)) : null,
    attrs,
  };
}

const origin = (baseURL: string | undefined): Record<string, string> => ({
  origin: new URL(baseURL ?? "http://localhost:3100").origin,
});

async function customerSignIn(
  request: APIRequestContext,
  baseURL: string | undefined,
  mail: {
    latestTo: (to: string) => Promise<{ text: string }>;
    firstLink: (t: string) => string | undefined;
  },
  headers: Record<string, string> = {},
): Promise<{ email: string; res: APIResponse }> {
  const email = uniqueEmail("conformance");
  const asked = await request.post("/api/auth/sign-in/magic-link", {
    data: { email, callbackURL: "/wallet" },
    headers: { ...origin(baseURL), ...TURNSTILE },
  });
  expect(asked.status()).toBe(200);
  const link = new URL(mail.firstLink((await mail.latestTo(email)).text) ?? "");
  const res = await request.post("/api/sign-in/confirm", {
    form: { token: link.searchParams.get("token") ?? "", returnTo: "" },
    headers: { ...origin(baseURL), ...headers },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(303);
  return { email, res };
}

async function signInWithCode(
  request: APIRequestContext,
  baseURL: string | undefined,
  user: { email: string; password: string; totpSecret?: string },
): Promise<APIResponse> {
  const first = await request.post("/api/auth/sign-in/email", {
    data: { email: user.email, password: user.password },
    headers: origin(baseURL),
  });
  expect(((await first.json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true);
  const code = new TOTP({ secret: user.totpSecret ?? "", digits: 6, period: 30 }).generate();
  const verified = await request.post("/api/auth/two-factor/verify-totp", {
    data: { code },
    headers: origin(baseURL),
  });
  expect(verified.status()).toBe(200);
  return verified;
}

const ageSessions = async (
  request: APIRequestContext,
  userId: string,
  opts: { createdAgoMs?: number; expiresInMs?: number },
): Promise<void> => {
  const res = await request.post("/api/test/age-sessions", {
    data: { userId, ...opts },
    headers: testApiHeaders(),
  });
  expect(res.status()).toBe(200);
};

test.describe("[P0-19] SECURITY conformance (production build)", () => {
  test("[P0-19] customer session cookie: 30 days, HttpOnly, SameSite=Lax, Path=/", async ({
    request,
    baseURL,
    mail,
  }) => {
    const { res } = await customerSignIn(request, baseURL, mail);
    const cookie = sessionCookie(res);
    expect(cookie.name).toBe("moz.session_token");
    expect(cookie.maxAge).toBe(30 * DAY);
    expect(cookie.attrs).toEqual(expect.arrayContaining(["httponly", "samesite=lax", "path=/"]));
    expect(cookie.attrs.some((a) => a.startsWith("domain="))).toBe(false);
  });

  test("[P0-19] staff cookie lives at most 12 h and admin at most 2 h from sign-in", async ({
    request,
    baseURL,
    createUser,
  }) => {
    const staff = await createUser("conf-staff", { totp: true });
    const staffCookie = sessionCookie(await signInWithCode(request, baseURL, staff));
    expect(staffCookie.maxAge).toBeLessThanOrEqual(12 * 3600);
    expect(staffCookie.maxAge).toBeGreaterThan(12 * 3600 - 60);
    expect(staffCookie.attrs).toEqual(expect.arrayContaining(["httponly", "samesite=lax"]));

    const admin = await createUser("conf-admin", { totp: true, admin: true });
    const adminCookie = sessionCookie(await signInWithCode(request, baseURL, admin));
    expect(adminCookie.maxAge).toBeLessThanOrEqual(2 * 3600);
    expect(adminCookie.maxAge).toBeGreaterThan(2 * 3600 - 60);
  });

  test("[P0-19] staff sessions stop working 12 h after sign-in, admin sessions after 2 h", async ({
    request,
    baseURL,
    createUser,
  }) => {
    const rename = () =>
      request.post("/api/auth/update-user", {
        data: { name: "Renamed" },
        headers: origin(baseURL),
      });

    const staff = await createUser("conf-staff-age", { totp: true });
    await signInWithCode(request, baseURL, staff);
    await ageSessions(request, staff.userId, { createdAgoMs: 12 * H - 60_000 });
    expect((await rename()).status()).toBe(200);
    await ageSessions(request, staff.userId, { createdAgoMs: 12 * H + 60_000 });
    expect((await rename()).status()).toBe(403);

    const admin = await createUser("conf-admin-age", { totp: true, admin: true });
    await signInWithCode(request, baseURL, admin);
    await ageSessions(request, admin.userId, { createdAgoMs: 2 * H - 60_000 });
    expect((await rename()).status()).toBe(200);
    await ageSessions(request, admin.userId, { createdAgoMs: 2 * H + 60_000 });
    expect((await rename()).status()).toBe(403);
  });

  test("[P0-19] customer sessions end after 30 days idle and slide with use", async ({
    request,
    baseURL,
    mail,
  }) => {
    const { email } = await customerSignIn(request, baseURL, mail);
    const session = async () =>
      (await (await request.get("/api/auth/get-session")).json()) as {
        user: { id: string; email: string };
      } | null;
    const me = await session();
    expect(me?.user.email).toBe(email);
    const userId = me?.user.id ?? "";

    // Used within the last day of its 30: the next request slides it to a fresh 30 days.
    await ageSessions(request, userId, { createdAgoMs: 29 * DAY * 1000, expiresInMs: H });
    const slid = await request.get("/api/auth/get-session");
    expect(sessionCookie(slid).maxAge).toBe(30 * DAY);

    // Not used for 30 days: gone.
    await ageSessions(request, userId, { expiresInMs: -1000 });
    expect(await session()).toBeNull();
  });

  test("[P0-19] the client IP is the proxy's right-most hop; a spoofed X-Forwarded-For entry is ignored", async ({
    request,
    baseURL,
    mail,
  }) => {
    // IPv4 so the recorded value is exact (IPv6 is stored as its /64: ip-bucket.test.ts, ip.ts).
    const real = `203.0.113.${String(1 + Math.floor(Math.random() * 254))}`;
    await customerSignIn(request, baseURL, mail, { "x-forwarded-for": `6.6.6.6, ${real}` });
    const me = (await (await request.get("/api/auth/get-session")).json()) as {
      user: { id: string };
    };
    // The app never shows session IPs (the library's list-sessions is disabled): read the row via the test API.
    const recorded = await request.get(`/api/test/sessions?userId=${me.user.id}`, {
      headers: testApiHeaders(),
    });
    expect(((await recorded.json()) as { ips: unknown[] }).ips).toEqual([real]);
  });

  test("[P0-19] /api/auth/* answers 429 with Retry-After past 100 requests a minute from one IP", async ({
    request,
  }) => {
    const flood = clientHeaders();
    let last: APIResponse | undefined;
    for (let i = 0; i < 101; i++) {
      last = await request.get("/api/auth/get-session", { headers: flood });
      if (i < 100) expect(last.status(), `request ${String(i + 1)}`).toBe(200);
    }
    expect(last?.status()).toBe(429);
    expect(Number(last?.headers()["retry-after"])).toBeGreaterThan(0);
    expect(((await last?.json()) as { code?: string }).code).toBe("TOO_MANY_REQUESTS");
    // Another address is unaffected.
    expect(
      (await request.get("/api/auth/get-session", { headers: clientHeaders() })).status(),
    ).toBe(200);
  });

  test("[P0-19] §5 headers on pages, API routes and prefetches; fresh CSP nonce; no shared caching; malformed request id replaced", async ({
    request,
  }) => {
    const staticSet = (h: Record<string, string>, what: string): void => {
      expect(h["strict-transport-security"], what).toBe(
        "max-age=63072000; includeSubDomains; preload",
      );
      expect(h["x-content-type-options"], what).toBe("nosniff");
      expect(h["referrer-policy"], what).toBe("strict-origin-when-cross-origin");
      expect(h["cross-origin-opener-policy"], what).toBe("same-origin");
      expect(h["permissions-policy"], what).toContain("camera=()");
      expect(h["x-frame-options"], what).toBe("DENY");
      expect(h["x-powered-by"], what).toBeUndefined();
    };

    // A malformed incoming id is replaced, never reflected. (A well-formed one is kept because behind Caddy
    // only Caddy sets it: the Caddyfile overwrites any client value, checked on staging — CARRIED C-23.)
    const page1 = await request.get("/sign-in", {
      headers: { "x-request-id": "<script>alert(1)</script>" },
    });
    const page2 = await request.get("/sign-in");
    const h = page1.headers();
    staticSet(h, "page");
    const csp = h["content-security-policy"] ?? "";
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ]) {
      expect(csp).toContain(directive);
    }
    const nonce = (p: APIResponse) =>
      /'nonce-([^']+)'/.exec(p.headers()["content-security-policy"] ?? "")?.[1];
    expect(nonce(page1)).toBeTruthy();
    expect(nonce(page1)).not.toBe(nonce(page2));
    expect(h["cache-control"]).toContain("no-store");
    expect(h["cache-control"]).not.toMatch(/public|s-maxage/);
    expect(h["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

    staticSet((await request.get("/api/auth/get-session")).headers(), "api");
    staticSet(
      (
        await request.get("/sign-in", { headers: { "next-router-prefetch": "1", rsc: "1" } })
      ).headers(),
      "prefetch",
    );
  });
});
