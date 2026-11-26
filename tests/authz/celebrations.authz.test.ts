import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { POST as claimRoute } from "@/app/api/me/celebration/route";
import type { ActionResult } from "@/server/actionTemplate";
import { runAsPrincipal } from "@/server/authz/principal";
import { testOwnerDb as db } from "@/server/db/client";
import { pointRequests } from "@/server/db/schema";
import { env } from "@/server/env";
import { makeMembership, makeProgramme, makeUser } from "@/server/testing/factories";
import { approvedVisit } from "@/server/testing/visits";
import { authzMatrix, type Role, world } from "./harness";

// The celebration claim (P1-15): any signed-in account claims its own customer approvals (staff and admins can
// be customers too, PRODUCT §2). The member is always the session user; the body must be `{}`.
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

const claim = (body: unknown = {}, origin: string | null = new URL(env().APP_URL).origin) =>
  claimRoute(
    new Request("http://localhost:3100/api/me/celebration", {
      method: "POST",
      headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
      body: JSON.stringify(body),
    }),
  );

async function asResult(res: Response): Promise<ActionResult<unknown>> {
  const body = (await res.json()) as { data?: unknown; error?: { code: never; message: string } };
  return res.status === 200
    ? { ok: true, data: body.data ?? null }
    : { ok: false, error: body.error ?? { code: "INTERNAL", message: "" } };
}

authzMatrix("POST /api/me/celebration", {
  allow: SIGNED_IN,
  run: async () => asResult(await claim()),
});

it("[P1-15] the claim acts on the caller's own approvals only: any field in the body is refused", async () => {
  const w = await world();
  const victim = await makeUser();
  await makeProgramme(w.shopA.id, 1_000);
  const member = await makeMembership(victim.id, w.shopA.id);
  const approved = await approvedVisit(member, { amountPence: 840 });

  const refused = await runAsPrincipal(w.principals.customer, async () =>
    asResult(await claim({ userId: victim.id })),
  );
  expect(refused).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  const own = await runAsPrincipal(w.principals.customer, async () => asResult(await claim()));
  expect(own).toEqual({ ok: true, data: null });
  const [row] = await db()
    .select({ seenAt: pointRequests.seenAt })
    .from(pointRequests)
    .where(eq(pointRequests.id, approved.requestId));
  expect(row?.seenAt).toBeNull();
});

it("[P1-15] a cross-site POST is refused before anything is claimed", async () => {
  const w = await world();
  const res = await runAsPrincipal(w.principals.customer, async () =>
    asResult(await claim({}, "https://evil.example")),
  );
  expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
});
