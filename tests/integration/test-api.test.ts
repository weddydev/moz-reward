import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_API_HEADER, testApiToken } from "@/lib/test-api-token";

/** The token the route expects, from whatever AUTH_SECRET this test run uses (read lazily: env may be stubbed). */
const token = (): Record<string, string> => ({
  [TEST_API_HEADER]: testApiToken(process.env.AUTH_SECRET ?? ""),
});

const call = (
  mod: { POST: (req: Request, ctx: { params: Promise<{ action: string }> }) => Promise<Response> },
  body: unknown,
  action = "session",
  headers: Record<string, string> = token(),
) =>
  mod.POST(
    new Request("http://localhost:3000/api/test/session", {
      method: "POST",
      body: JSON.stringify(body),
      headers,
    }),
    {
      params: Promise.resolve({ action }),
    },
  );

const get = (
  mod: { GET: (req: Request, ctx: { params: Promise<{ action: string }> }) => Promise<Response> },
  action: string,
  headers: Record<string, string> = token(),
) =>
  mod.GET(new Request(`http://localhost:3000/api/test/${action}`, { headers }), {
    params: Promise.resolve({ action }),
  });

describe("[P0-17] test-only seeding API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("creates an actor and an MFA-verified staff session when APP_ENV=test", async () => {
    const route = await import("@/app/api/test/[action]/route");
    const res = await call(route, { role: "owner" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string; shopId: string | null };
    expect(body.shopId).toBeTruthy();
    const sessionCookie = res.headers.getSetCookie().find((c) => c.includes("session_token="));
    expect(sessionCookie).toBeTruthy();
    // Regression: Better Auth gives `expires` in seconds; treating it as ms dated the cookie 1970 (browser dropped it).
    const expires = /expires=([^;]+)/i.exec(sessionCookie!)?.[1];
    expect(expires && new Date(expires).getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);

    const { db } = await import("@/server/db/client");
    const { sessions } = await import("@/server/db/schema");
    const rows = await db().select().from(sessions).where(eq(sessions.userId, body.userId));
    expect(rows.map((r) => r.mfaVerified)).toEqual([true]);
  });

  it("gives customers a non-MFA session and rejects unknown roles", async () => {
    const route = await import("@/app/api/test/[action]/route");
    expect((await call(route, { role: "customer" })).status).toBe(200);
    expect((await call(route, { role: "superuser" })).status).toBe(400);
    expect((await call(route, { role: "customer" }, "drop-tables")).status).toBe(404);
  });

  it.each([
    ["staging", "https://staging.mozrewards.co.uk"],
    ["production", "https://mozrewards.co.uk"],
  ])("returns 404 when APP_ENV=%s", async (appEnv, url) => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production"); // staging/production run a production build (env cross-check)
    vi.stubEnv("APP_ENV", appEnv);
    vi.stubEnv("APP_URL", url);
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("EMAIL_API_KEY", "re_test_key");
    vi.stubEnv("TRUSTED_PROXY", "caddy");
    const route = await import("@/app/api/test/[action]/route");
    const res = await call(route, { role: "admin_owner" });
    expect(res.status).toBe(404);
    for (const action of ["push", "runtime"]) {
      expect((await get(route, action)).status).toBe(404);
    }
  });

  it("[P0-14] answers 404 without the AUTH_SECRET-derived token, even with APP_ENV=test (SEC-L4)", async () => {
    const route = await import("@/app/api/test/[action]/route");
    const wrong = { [TEST_API_HEADER]: testApiToken("some-other-environment's-secret-value") };
    for (const headers of [{}, wrong, { [TEST_API_HEADER]: "" }]) {
      expect((await call(route, { role: "customer" }, "session", headers)).status).toBe(404);
      expect((await get(route, "runtime", headers)).status).toBe(404);
    }
    expect((await call(route, { role: "customer" })).status).toBe(200);
  });

  it("[P0-14] answers 404 to every other method, so the route's existence never shows (A-QA-9)", async () => {
    const route = await import("@/app/api/test/[action]/route");
    for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"] as const) {
      const handler = route[method] as unknown;
      expect(typeof handler, `${method} must be exported (Next answers 405/204 otherwise)`).toBe(
        "function",
      );
      const res = (handler as () => Response)();
      expect(res.status, method).toBe(404);
    }
  });

  it("[P0-14] reports the server's NODE_ENV and Better Auth's resolved limiter setting", async () => {
    const route = await import("@/app/api/test/[action]/route");
    const res = await get(route, "runtime");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nodeEnv: "test", betterAuthRateLimitEnabled: false });
  });

  it("creates a password user without a session (for sign-in flows driven through the UI)", async () => {
    const route = await import("@/app/api/test/[action]/route");
    const res = await call(route, { label: "e2e-staff" }, "user");
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual([]);
    const body = (await res.json()) as { userId: string; email: string; password: string };
    expect(body.email).toMatch(/^e2e-staff.*@/);
    expect(body.password.length).toBeGreaterThanOrEqual(12);

    const { db } = await import("@/server/db/client");
    const { sessions } = await import("@/server/db/schema");
    expect(await db().select().from(sessions).where(eq(sessions.userId, body.userId))).toEqual([]);
    expect((await call(route, { label: "x".repeat(100) }, "user")).status).toBe(400);
  });

  it("exposes recorded push payloads and lets tests script and reset the fakes", async () => {
    const route = await import("@/app/api/test/[action]/route");
    const { sendPush } = await import("@/server/integrations/push");
    const { complete } = await import("@/server/integrations/ai");
    const fetchGet = (action: string) => get(route, action);

    expect((await call(route, {}, "reset-fakes")).status).toBe(200);
    await sendPush({ endpoint: "e1" }, { title: "Points credited", body: "+20" });
    const pushes = (await (await fetchGet("push")).json()) as { payload: { title: string } }[];
    expect(pushes.map((p) => p.payload.title)).toEqual(["Points credited"]);

    expect((await call(route, { ai: { mode: "error" } }, "fakes")).status).toBe(200);
    await expect(complete({ purpose: "review-help", prompt: "x" })).rejects.toThrow(/unavailable/);
    expect((await call(route, { ai: { mode: "nonsense" } }, "fakes")).status).toBe(400);

    expect((await call(route, {}, "reset-fakes")).status).toBe(200);
    expect(await (await fetchGet("push")).json()).toEqual([]);
    await expect(complete({ purpose: "review-help", prompt: "x" })).resolves.toHaveProperty("text");
    expect((await fetchGet("unknown")).status).toBe(404);
  });
});
