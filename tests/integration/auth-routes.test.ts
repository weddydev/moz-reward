import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as route from "@/app/api/auth/[...all]/route";
import { getAuth } from "@/server/auth/auth";
import { ALLOWED_AUTH_ROUTES, BLOCKED_AUTH_ROUTES, reviewGaps } from "@/server/auth/routes";
import { testOwnerDb as db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { markSessionMfaVerified } from "@/server/testing/factories";
import { TEST_PASSWORD, cookieHeaderFrom, createPasswordUser } from "../fixtures/auth";

type Endpoint = { path?: string; options?: { metadata?: { SERVER_ONLY?: boolean } } };
const ORIGIN = "http://localhost:3000";

/** HTTP paths the installed Better Auth mounts (server-only endpoints have no path). */
const mountedPaths = (): string[] =>
  Object.values(getAuth().api as unknown as Record<string, Endpoint>)
    .filter((e) => e.path && !e.options?.metadata?.SERVER_ONLY)
    .map((e) => e.path ?? "");

const call = (method: "GET" | "POST", path: string, init: RequestInit = {}) =>
  route[method](new Request(`${ORIGIN}/api/auth${path}`, { method, ...init }));

describe("[P0-19] Better Auth surface matches the reviewed allowlist", () => {
  it("every endpoint the installed library mounts is reviewed (an upgrade adding one fails here)", () => {
    expect(reviewGaps(mountedPaths())).toEqual({ unreviewed: [], stale: [] });
  });

  it("every blocked endpoint answers 404 over HTTP, for GET and POST", async () => {
    for (const { path } of BLOCKED_AUTH_ROUTES) {
      const concrete = path.replace(/:[a-z]+/g, "x1");
      for (const method of ["GET", "POST"] as const) {
        const res = await call(method, concrete, {
          headers: { origin: ORIGIN, "content-type": "application/json" },
          ...(method === "POST" ? { body: "{}" } : {}),
        });
        expect(res.status, `${method} ${concrete}`).toBe(404);
      }
    }
  });

  it("allowed endpoints still reach Better Auth (signed-out session read)", async () => {
    expect(ALLOWED_AUTH_ROUTES.length).toBeGreaterThan(0);
    const res = await call("GET", "/get-session");
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });
});

describe("[P0-19] /update-user accepts only a bounded display name", () => {
  async function signedIn() {
    const user = await createPasswordUser();
    const res = await getAuth().api.signInEmail({
      body: { email: user.email, password: TEST_PASSWORD },
      asResponse: true,
    });
    // Staff-like password users need an MFA-verified session for account changes (privileged gate):
    // mark it as a real TOTP sign-in would.
    const [session] = await db().select().from(sessions).where(eq(sessions.userId, user.id));
    await markSessionMfaVerified(session?.token ?? "");
    const headers = cookieHeaderFrom(res);
    headers.set("content-type", "application/json");
    return { user, headers };
  }

  it("refuses an over-long name, other fields, and an empty name; the row is unchanged", async () => {
    const { user, headers } = await signedIn();
    for (const body of [
      { name: "x".repeat(81) },
      { name: "   " },
      { name: "Ok", image: "https://evil.example/x.png" },
      { email: "takeover@example.com" },
    ]) {
      const res = await call("POST", "/update-user", { headers, body: JSON.stringify(body) });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const [row] = await db().select().from(users).where(eq(users.id, user.id));
    expect(row?.name).toBe(user.name);
    expect(row?.image ?? null).toBeNull();
  });

  it("changes the name when it is the only field and within 80 characters", async () => {
    const { user, headers } = await signedIn();
    const res = await call("POST", "/update-user", {
      headers,
      body: JSON.stringify({ name: "  Priya Patel  " }),
    });
    expect(res.status).toBe(200);
    const [row] = await db().select().from(users).where(eq(users.id, user.id));
    expect(row?.name.trim()).toBe("Priya Patel");
  });
});
