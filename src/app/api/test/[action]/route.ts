import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { systemScope } from "@/server/authz/scope";
import { fakeAi } from "@/server/integrations/ai";
import { fakePushSink } from "@/server/integrations/push";
import { deleteUserSessions } from "@/server/repos/sessions";
import {
  ACTOR_ROLES,
  TEST_PASSWORD,
  fakeEmail,
  makeActor,
  makeUser,
  markSessionMfaVerified,
} from "@/server/testing/factories";
import { testApiEnabled } from "@/server/testing/test-api";

/**
 * Test-only seeding API (APP_ENV=test). Lets E2E specs create exactly the data they need and sign in
 * as any role without driving the UI. Returns 404 in every other environment (proved by a test).
 */
const notFound = (): Response => new Response("Not found", { status: 404 });

const sessionInput = z.object({ role: z.enum(ACTOR_ROLES), shopId: z.uuid().optional() }).strict();

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
  })
  .strict();

/**
 * Turns on TOTP the way the UI does (enable with the password, then verify a code), then drops the setup
 * sessions so the browser starts signed out. Lets specs test the code challenge without re-running the
 * whole enrolment flow first.
 */
async function enrolTotp(userId: string): Promise<string> {
  const helpers = ((await auth.$context) as unknown as { test?: TestHelpers }).test;
  if (!helpers) throw new Error("test utilities unavailable");
  const { cookies } = await helpers.login({ userId });
  const headers = new Headers({ cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") });
  const enabled = await auth.api.enableTwoFactor({ body: { password: TEST_PASSWORD }, headers });
  if (!("totpURI" in enabled)) throw new Error("TOTP enrolment did not return a URI");
  const { TOTP, URI } = await import("otpauth");
  const totp = URI.parse(enabled.totpURI);
  if (!(totp instanceof TOTP)) throw new Error("unexpected OTP type");
  await auth.api.verifyTOTP({ body: { code: totp.generate() }, headers });
  await deleteUserSessions(systemScope("test API: drop TOTP setup sessions"), userId);
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

type Ctx = { params: Promise<{ action: string }> };
const invalid = (): Response => NextResponse.json({ error: "invalid input" }, { status: 400 });

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  if (!testApiEnabled()) return notFound();
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
      const totpSecret = parsed.data.totp ? await enrolTotp(user.id) : undefined;
      return NextResponse.json({
        userId: user.id,
        email: user.email,
        password: TEST_PASSWORD,
        ...(totpSecret ? { totpSecret } : {}),
      });
    }
    case "fakes": {
      const parsed = fakesInput.safeParse(body);
      if (!parsed.success) return invalid();
      if (parsed.data.ai) fakeAi.script(parsed.data.ai);
      return NextResponse.json({ ok: true });
    }
    case "reset-fakes":
      fakePushSink.reset();
      fakeAi.reset();
      return NextResponse.json({ ok: true });
    default:
      return notFound();
  }
}

/** GET /api/test/push → payloads recorded by the fake push sink. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  if (!testApiEnabled()) return notFound();
  const { action } = await ctx.params;
  return action === "push" ? NextResponse.json(fakePushSink.list()) : notFound();
}

async function createSession(body: unknown): Promise<Response> {
  const parsed = sessionInput.safeParse(body);
  if (!parsed.success) return invalid();

  const actor = await makeActor(
    parsed.data.role,
    parsed.data.shopId ? { shopId: parsed.data.shopId } : {},
  );
  const helpers = ((await auth.$context) as unknown as { test?: TestHelpers }).test;
  if (!helpers) return NextResponse.json({ error: "test utilities unavailable" }, { status: 500 });

  const login = await helpers.login({ userId: actor.user.id });
  // Staff/admin sessions must be MFA-verified, exactly like a real TOTP sign-in.
  if (parsed.data.role !== "customer") await markSessionMfaVerified(login.token);

  const res = NextResponse.json({
    userId: actor.user.id,
    email: actor.user.email,
    shopId: actor.shopId,
    role: parsed.data.role,
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
