import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/server/auth/auth";
import { beginStaffLogin } from "@/server/auth/staff-login";
import { authScope } from "@/server/authz/scope";
import { fakeAi } from "@/server/integrations/ai";
import { fakePushSink } from "@/server/integrations/push";
import { deleteUserSessions } from "@/server/repos/sessions";
import {
  ACTOR_ROLES,
  ageUserSessions,
  userSessionIps,
  TEST_PASSWORD,
  fakeEmail,
  makeActor,
  makeAdmin,
  makeOpsSnapshot,
  makeShop,
  makeStaff,
  makeUser,
  markSessionMfaVerified,
} from "@/server/testing/factories";
import { testApiAllowed } from "@/server/testing/test-api";

/**
 * Test-only seeding API (APP_ENV=test). Lets E2E specs create exactly the data they need and sign in
 * as any role without driving the UI. Returns 404 in every other environment (proved by a test).
 */
const notFound = (): Response => new Response("Not found", { status: 404 });

const sessionInput = z
  .object({
    role: z.enum(ACTOR_ROLES),
    shopId: z.uuid().optional(),
    /** P0-12: staff/owner actors can also be staff of this many extra new shops (shop switcher). */
    extraShops: z.number().int().min(0).max(3).optional(),
  })
  .strict();

type TestCookie = {
  name: string;
  value: string;
  path: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  expires?: number;
};
type TestHelpers = {
  login(opts: { userId: string }): Promise<{ token: string; cookies: TestCookie[] }>;
};

/** A password user with no session: lets E2E drive real sign-in/enrolment flows through the UI. */
const userInput = z
  .object({
    label: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .default("e2e-user"),
    /** Enrol TOTP up front (through Better Auth's own endpoints) and return the secret. */
    totp: z.boolean().default(false),
    /**
     * Wrong-password attempts already made on the account, each from its own address (P0-19): reserved
     * through the real guard and never cleared, so `lockAfter` of them put the account in "needs a check".
     */
    failedSignIns: z.number().int().min(0).max(20).default(0),
    /** Also an admin (owner): admin session rules (2 h) instead of staff ones. */
    admin: z.boolean().default(false),
  })
  .strict();

/**
 * Turns on TOTP the way the UI does (enable with the password, then verify a code), then drops the setup
 * sessions so the browser starts signed out. Lets specs test the code challenge without re-running the
 * whole enrolment flow first.
 */
async function enrolTotp(userId: string): Promise<string> {
  const helpers = ((await getAuth().$context) as unknown as { test?: TestHelpers }).test;
  if (!helpers) throw new Error("test utilities unavailable");
  const { cookies } = await helpers.login({ userId });
  const headers = new Headers({ cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") });
  const enabled = await getAuth().api.enableTwoFactor({
    body: { password: TEST_PASSWORD },
    headers,
  });
  if (!("totpURI" in enabled)) throw new Error("TOTP enrolment did not return a URI");
  const { TOTP, URI } = await import("otpauth");
  const totp = URI.parse(enabled.totpURI);
  if (!(totp instanceof TOTP)) throw new Error("unexpected OTP type");
  await getAuth().api.verifyTOTP({ body: { code: totp.generate() }, headers });
  await deleteUserSessions(authScope("test API: drop TOTP setup sessions"), userId);
  return totp.secret.base32;
}

const fakesInput = z
  .object({
    ai: z
      .discriminatedUnion("mode", [
        z.object({ mode: z.literal("ok"), text: z.string().max(2000) }).strict(),
        z.object({ mode: z.enum(["error", "timeout", "empty"]) }).strict(),
      ])
      .optional(),
  })
  .strict();

/** Moves a user's sessions back in time (role limits, idle expiry) for the P0-19 conformance spec. */
const ageInput = z
  .object({
    userId: z.string().min(1).max(64),
    createdAgoMs: z
      .number()
      .int()
      .min(0)
      .max(400 * 24 * 3600 * 1000)
      .optional(),
    expiresInMs: z
      .number()
      .int()
      .min(-400 * 24 * 3600 * 1000)
      .max(400 * 24 * 3600 * 1000)
      .optional(),
  })
  .strict();

type Ctx = { params: Promise<{ action: string }> };
const invalid = (): Response => NextResponse.json({ error: "invalid input" }, { status: 400 });

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  if (!testApiAllowed(req)) return notFound();
  const { action } = await ctx.params;
  const body: unknown = await req.json().catch(() => null);
  switch (action) {
    case "session":
      return createSession(body);
    case "user": {
      const parsed = userInput.safeParse(body ?? {});
      if (!parsed.success) return invalid();
      const user = await makeUser({
        email: fakeEmail(parsed.data.label),
        name: "Test Staff",
        password: TEST_PASSWORD,
      });
      if (parsed.data.admin) await makeAdmin(user.id, "owner");
      const totpSecret = parsed.data.totp ? await enrolTotp(user.id) : undefined;
      for (let i = 0; i < parsed.data.failedSignIns; i++) {
        // TEST-NET-2 addresses: distinct sources, so no single account + IP pair is locked.
        const seeded = await beginStaffLogin({
          email: user.email,
          ip: `198.51.100.${String(i + 1)}`,
        });
        if (!seeded.ok) throw new Error(`seeding failed sign-ins: ${seeded.code}`);
      }
      return NextResponse.json({
        userId: user.id,
        email: user.email,
        password: TEST_PASSWORD,
        ...(totpSecret ? { totpSecret } : {}),
      });
    }
    case "age-sessions": {
      const parsed = ageInput.safeParse(body);
      if (!parsed.success) return invalid();
      await ageUserSessions(parsed.data.userId, parsed.data);
      return NextResponse.json({ ok: true });
    }
    case "fakes": {
      const parsed = fakesInput.safeParse(body);
      if (!parsed.success) return invalid();
      if (parsed.data.ai) fakeAi.script(parsed.data.ai);
      return NextResponse.json({ ok: true });
    }
    case "ops-snapshot": {
      // P0-13: a sample health snapshot for the System page (the E2E server runs no worker).
      const snapshot = await makeOpsSnapshot();
      return NextResponse.json({ takenAt: snapshot.takenAt });
    }
    case "reset-fakes":
      fakePushSink.reset();
      fakeAi.reset();
      return NextResponse.json({ ok: true });
    default:
      return notFound();
  }
}

/**
 * GET /api/test/push → payloads recorded by the fake push sink.
 * GET /api/test/runtime → how the running server was built (P0-14 production parity): NODE_ENV and
 * Better Auth's *resolved* limiter setting. A request burst can't prove the limiter is off locally
 * (TRUSTED_PROXY=none disables Better Auth's IP tracking, which also no-ops its limiter), so the E2E
 * spec reads the value the library actually resolved.
 */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  if (!testApiAllowed(req)) return notFound();
  const { action } = await ctx.params;
  switch (action) {
    case "push":
      return NextResponse.json(fakePushSink.list());
    case "sessions": {
      // ?userId= → the client IPs recorded on that user's sessions (P0-19 conformance).
      const userId = new URL(req.url).searchParams.get("userId") ?? "";
      if (!userId || userId.length > 64) return invalid();
      return NextResponse.json({ ips: await userSessionIps(userId) });
    }
    case "runtime": {
      const context = (await getAuth().$context) as unknown as {
        rateLimit?: { enabled?: unknown };
      };
      return NextResponse.json({
        nodeEnv: process.env.NODE_ENV,
        betterAuthRateLimitEnabled: context.rateLimit?.enabled ?? null,
      });
    }
    default:
      return notFound();
  }
}

/**
 * Every other method is a plain 404 too, in every environment (A-QA-9): left unexported, Next would answer
 * 405 (and OPTIONS 204 with an Allow header), which reveals that the route exists. HEAD follows GET.
 */
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const OPTIONS = notFound;

async function createSession(body: unknown): Promise<Response> {
  const parsed = sessionInput.safeParse(body);
  if (!parsed.success) return invalid();

  const actor = await makeActor(
    parsed.data.role,
    parsed.data.shopId ? { shopId: parsed.data.shopId } : {},
  );
  const extraShopIds: string[] = [];
  for (let i = 0; i < (parsed.data.extraShops ?? 0); i++) {
    const shop = await makeShop({ name: `Second Shop ${String(i + 1)}` });
    await makeStaff(shop.id, actor.user.id, "staff");
    extraShopIds.push(shop.id);
  }
  const helpers = ((await getAuth().$context) as unknown as { test?: TestHelpers }).test;
  if (!helpers) return NextResponse.json({ error: "test utilities unavailable" }, { status: 500 });

  const login = await helpers.login({ userId: actor.user.id });
  // Staff/admin sessions must be MFA-verified, exactly like a real TOTP sign-in.
  if (parsed.data.role !== "customer") await markSessionMfaVerified(login.token);

  const res = NextResponse.json({
    userId: actor.user.id,
    email: actor.user.email,
    shopId: actor.shopId,
    shopCode: actor.shopCode,
    role: parsed.data.role,
    extraShopIds,
  });
  for (const c of login.cookies) {
    res.cookies.set(c.name, c.value, {
      path: c.path,
      httpOnly: c.httpOnly ?? true,
      secure: c.secure ?? false,
      sameSite: (c.sameSite ?? "Lax").toLowerCase() as "lax" | "strict" | "none",
      // Better Auth's test cookie uses Playwright's convention: `expires` in seconds since the epoch.
      ...(c.expires ? { expires: new Date(c.expires * 1000) } : {}),
    });
  }
  return res;
}
