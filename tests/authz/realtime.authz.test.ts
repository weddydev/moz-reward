import { afterAll } from "vitest";
import { GET as meStream } from "@/app/api/sse/me/route";
import { GET as shopStream } from "@/app/api/sse/shop/[shopId]/route";
import { newId } from "@/lib/id";
import type { ActionResult } from "@/server/actionTemplate";
import { currentPrincipal, runAsPrincipal } from "@/server/authz/principal";
import { testOwnerDb as db } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { closeRealtimeHub } from "@/server/realtime/process-hub";
import { authzMatrix, type Role } from "./harness";

/**
 * P1-10: the realtime streams. Each role's principal gets a real session row (the stream is tied to a session
 * id the heartbeat re-checks), then calls the real route handler; 200 = allowed (the stream is cancelled at
 * once), an error body = its code.
 */
const SIGNED_IN: Role[] = [
  "customer",
  "staff_other_shop",
  "owner_other_shop",
  "staff_own_shop",
  "owner_own_shop",
  "owner_own_shop_no_mfa",
  "staff_own_shop_inactive",
  "admin_owner",
  "admin_support",
  "admin_moderator",
  "admin_finance",
  "admin_owner_no_mfa",
];

const request = (path: string): Request =>
  new Request(`http://localhost:3100${path}`, { headers: { "sec-fetch-site": "same-origin" } });

async function asStreamResult(call: () => Promise<Response>): Promise<ActionResult<unknown>> {
  const p = await currentPrincipal();
  let principal = p;
  if (p) {
    const [row] = await db()
      .insert(sessions)
      .values({
        userId: p.userId,
        token: `t_${newId()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .returning({ id: sessions.id });
    if (!row) throw new Error("no session row");
    principal = { ...p, sessionId: row.id };
  }
  const res = await runAsPrincipal(principal, call);
  if (res.status === 200) {
    await res.body?.cancel();
    return { ok: true, data: null };
  }
  const body = (await res.json()) as { error: { code: never; message: string } };
  return { ok: false, error: body.error };
}

afterAll(() => {
  closeRealtimeHub();
});

authzMatrix("GET /api/sse/me", {
  allow: SIGNED_IN,
  run: () => asStreamResult(() => meStream(request("/api/sse/me"))),
});

authzMatrix("GET /api/sse/shop/[shopId]", {
  // Only shop A's active team with MFA; shop B's staff and owner (cross-shop) are denied.
  allow: ["staff_own_shop", "owner_own_shop"],
  run: (w) =>
    asStreamResult(() =>
      shopStream(request(`/api/sse/shop/${w.shopA.id}`), {
        params: Promise.resolve({ shopId: w.shopA.id }),
      }),
    ),
});
