import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

const call = (
  mod: { POST: (req: Request, ctx: { params: Promise<{ action: string }> }) => Promise<Response> },
  body: unknown,
  action = "session",
) =>
  mod.POST(
    new Request("http://localhost:3000/api/test/session", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    {
      params: Promise.resolve({ action }),
    },
  );

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
    const route = await import("@/app/api/test/[action]/route");
    const res = await call(route, { role: "admin_owner" });
    expect(res.status).toBe(404);
    const get = await route.GET(new Request("http://localhost:3000/api/test/push"), {
      params: Promise.resolve({ action: "push" }),
    });
    expect(get.status).toBe(404);
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
    const get = (action: string) =>
      route.GET(new Request(`http://localhost:3000/api/test/${action}`), {
        params: Promise.resolve({ action }),
      });

    expect((await call(route, {}, "reset-fakes")).status).toBe(200);
    await sendPush({ endpoint: "e1" }, { title: "Points credited", body: "+20" });
    const pushes = (await (await get("push")).json()) as { payload: { title: string } }[];
    expect(pushes.map((p) => p.payload.title)).toEqual(["Points credited"]);

    expect((await call(route, { ai: { mode: "error" } }, "fakes")).status).toBe(200);
    await expect(complete({ purpose: "review-help", prompt: "x" })).rejects.toThrow(/unavailable/);
    expect((await call(route, { ai: { mode: "nonsense" } }, "fakes")).status).toBe(400);

    expect((await call(route, {}, "reset-fakes")).status).toBe(200);
    expect(await (await get("push")).json()).toEqual([]);
    await expect(complete({ purpose: "review-help", prompt: "x" })).resolves.toHaveProperty("text");
    expect((await get("unknown")).status).toBe(404);
  });
});
