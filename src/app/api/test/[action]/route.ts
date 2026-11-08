import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { fakeAi } from "@/server/integrations/ai";
import { fakePushSink } from "@/server/integrations/push";
import { ACTOR_ROLES, makeActor } from "@/server/testing/factories";
import { testApiEnabled } from "@/server/testing/test-api";

/**
 * Test-only seeding API (APP_ENV=test). Lets E2E specs create exactly the data they need and sign in
 * as any role without driving the UI. Returns 404 in every other environment (proved by a test).
 */
const notFound = (): Response => new Response("Not found", { status: 404 });

const sessionInput = z.object({ role: z.enum(ACTOR_ROLES), shopId: z.uuid().optional() }).strict();

type TestCookie = { name: string; value: string; path: string; httpOnly?: boolean; secure?: boolean; sameSite?: "Lax" | "Strict" | "None"; expires?: number };
type TestHelpers = { login(opts: { userId: string }): Promise<{ token: string; cookies: TestCookie[] }> };

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

  const actor = await makeActor(parsed.data.role, parsed.data.shopId ? { shopId: parsed.data.shopId } : {});
  const helpers = ((await auth.$context) as unknown as { test?: TestHelpers }).test;
  if (!helpers) return NextResponse.json({ error: "test utilities unavailable" }, { status: 500 });

  const login = await helpers.login({ userId: actor.user.id });
  // Staff/admin sessions must be MFA-verified, exactly like a real TOTP sign-in. The session create hook
  // in auth.ts deliberately forces mfaVerified=false for any non-MFA path (so production can never
  // be tricked into it), so set it here on the row, in this test-only, 404-gated route.
  if (parsed.data.role !== "customer") {
    await db().update(sessions).set({ mfaVerified: true }).where(eq(sessions.token, login.token));
  }

  const res = NextResponse.json({ userId: actor.user.id, email: actor.user.email, shopId: actor.shopId, role: parsed.data.role });
  for (const c of login.cookies) {
    res.cookies.set(c.name, c.value, {
      path: c.path,
      httpOnly: c.httpOnly ?? true,
      secure: c.secure ?? false,
      sameSite: (c.sameSite ?? "Lax").toLowerCase() as "lax" | "strict" | "none",
      ...(c.expires ? { expires: new Date(c.expires) } : {}),
    });
  }
  return res;
}
