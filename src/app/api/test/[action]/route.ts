import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { ACTOR_ROLES, makeActor } from "@/server/testing/factories";
import { testApiEnabled } from "@/server/testing/test-api";

/**
 * Test-only seeding API (APP_ENV=test). Lets E2E specs create exactly the data they need and sign in
 * as any role without driving the UI. Returns 404 in every other environment (proved by a test).
 */
const notFound = (): Response => new Response("Not found", { status: 404 });

const sessionInput = z.object({ role: z.enum(ACTOR_ROLES), shopId: z.uuid().optional() }).strict();

type TestCookie = { name: string; value: string; path: string; httpOnly?: boolean; secure?: boolean; sameSite?: "Lax" | "Strict" | "None"; expires?: number };
type TestHelpers = { login(opts: { userId: string; session?: Record<string, unknown> }): Promise<{ cookies: TestCookie[] }> };

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }): Promise<Response> {
  if (!testApiEnabled()) return notFound();
  const { action } = await ctx.params;
  if (action !== "session") return notFound();

  const parsed = sessionInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const actor = await makeActor(parsed.data.role, parsed.data.shopId ? { shopId: parsed.data.shopId } : {});
  const helpers = ((await auth.$context) as unknown as { test?: TestHelpers }).test;
  if (!helpers) return NextResponse.json({ error: "test utilities unavailable" }, { status: 500 });

  const login = await helpers.login({
    userId: actor.user.id,
    // Staff/admin sessions are created as MFA-verified, exactly like a real TOTP sign-in.
    session: { mfaVerified: parsed.data.role !== "customer" },
  });

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

export function GET(): Response {
  return notFound();
}
