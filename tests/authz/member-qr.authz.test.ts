import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { GET as memberQrRoute } from "@/app/api/me/member-qr/route";
import { verifyMemberQrAction } from "@/features/member-card/actions";
import { VERIFY_LIMITS } from "@/features/member-card/limits";
import type { MemberId } from "@/lib/brand";
import { formatMemberId } from "@/lib/codes";
import type { ActionResult } from "@/server/actionTemplate";
import { loadPrincipal, runAsPrincipal } from "@/server/authz/principal";
import { testOwnerDb as db } from "@/server/db/client";
import { pointRequests } from "@/server/db/schema";
import { MEMBER_QR_LIFETIME_MS, memberQrKeys, signMemberQr } from "@/server/security/member-qr";
import { limit, limiterKey, limiterRedis } from "@/server/security/rate-limit";
import {
  makeCustomerProfile,
  makeMembership,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";
import { authzMatrix, type Role } from "./harness";

/**
 * P1-14: member QR. The issue route is any signed-in account's own card (no profile → NOT_FOUND); the verify
 * action is the shop's active team (staff and owner, with TOTP). The real-row cases below prove whose card a
 * token reveals: only a CURRENT member of the caller's own shop (design check M5), and both verify limits
 * (per team member, per shop) refuse once spent (M4).
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

async function asResult(res: Response): Promise<ActionResult<unknown>> {
  if (res.status === 200) {
    await res.body?.cancel();
    return { ok: true, data: null };
  }
  const body = (await res.json()) as { error: { code: never; message: string } };
  return { ok: false, error: body.error };
}

const request = (): Request => new Request("http://localhost:3100/api/me/member-qr");

authzMatrix("GET /api/me/member-qr", {
  allow: SIGNED_IN,
  allowCodes: ["NOT_FOUND"],
  run: async () => asResult(await memberQrRoute(request())),
});

authzMatrix("verifyMemberQrAction", {
  allow: ["staff_own_shop", "owner_own_shop"],
  run: (w) => verifyMemberQrAction({ shopId: w.shopA.id, token: "MQ1.junk" }),
});

const principal = (userId: string) =>
  loadPrincipal({ userId, mfaVerified: true, sessionCreatedAt: new Date() });

async function customer(name: string) {
  const user = await makeUser();
  const profile = await makeCustomerProfile(user.id, { fullName: name });
  return { userId: user.id, memberId: profile.memberId };
}

async function team() {
  const [shopA, shopB] = await Promise.all([
    makeShop({ status: "active" }),
    makeShop({ status: "active" }),
  ]);
  const staffA = await makeUser();
  const staffB = await makeUser();
  const inactive = await makeUser();
  await makeStaff(shopA.id, staffA.id, "staff");
  await makeStaff(shopB.id, staffB.id, "staff");
  await makeStaff(shopA.id, inactive.id, "staff", { active: false });
  return {
    shopA,
    shopB,
    staffA: await principal(staffA.id),
    staffB: await principal(staffB.id),
    inactive: await principal(inactive.id),
  };
}

const token = (memberId: MemberId, now = Date.now()) =>
  signMemberQr(memberId, now, memberQrKeys()).token;

describe("[P1-14] member QR verify: whose card a token reveals", () => {
  it("[P1-14] the shop's staff see a current member's name and ID; nobody else learns anything", async () => {
    const t = await team();
    const ana = await customer("Ana Pereira");
    await makeMembership(ana.userId, t.shopA.id);
    const tok = token(ana.memberId);

    const own = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, token: tok }),
    );
    expect(own).toEqual({
      ok: true,
      data: {
        status: "ok",
        memberId: formatMemberId(ana.memberId),
        name: "Ana Pereira",
        purchaseCount: 0,
        lastVisitIso: null,
        streak: { weeks: 0, lastWeekStart: null },
        openRequest: null,
      },
    });

    // Another shop's staff, naming their own shop: the customer isn't their member.
    const other = await runAsPrincipal(t.staffB, () =>
      verifyMemberQrAction({ shopId: t.shopB.id, token: tok }),
    );
    expect(other).toEqual({ ok: true, data: { status: "not_member" } });

    // Naming shop A without being its staff: refused before any lookup.
    const cross = await runAsPrincipal(t.staffB, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, token: tok }),
    );
    expect(cross).toMatchObject({ ok: false });
    if (cross.ok) throw new Error("unreachable");
    expect(["FORBIDDEN", "NOT_FOUND"]).toContain(cross.error.code);

    // Deactivated staff of shop A: refused.
    const gone = await runAsPrincipal(t.inactive, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, token: tok }),
    );
    expect(gone.ok).toBe(false);
  });

  it("[P1-14] a former member (left the shop) is not_member", async () => {
    const t = await team();
    const ben = await customer("Ben Okafor");
    await makeMembership(ben.userId, t.shopA.id, { leftAt: new Date() });
    const res = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, token: token(ben.memberId) }),
    );
    expect(res).toEqual({ ok: true, data: { status: "not_member" } });
  });

  it("[P1-14] expired and tampered tokens are refused without a lookup", async () => {
    const t = await team();
    const cy = await customer("Cy Lane");
    await makeMembership(cy.userId, t.shopA.id);
    const old = token(cy.memberId, Date.now() - MEMBER_QR_LIFETIME_MS - 1000);
    const expired = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, token: old }),
    );
    expect(expired).toEqual({ ok: true, data: { status: "expired" } });

    const good = token(cy.memberId);
    const flipped = `${good.slice(0, 10)}${good[10] === "A" ? "B" : "A"}${good.slice(11)}`;
    for (const bad of [flipped, cy.memberId, formatMemberId(cy.memberId), "MQ1.x"]) {
      const res = await runAsPrincipal(t.staffA, () =>
        verifyMemberQrAction({ shopId: t.shopA.id, token: bad }),
      );
      expect(res, bad).toEqual({ ok: true, data: { status: "invalid" } });
    }
    const long = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, token: "x".repeat(129) }),
    );
    expect(long).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("[P1-14] the per-team-member limit refuses once spent (fails closed)", async () => {
    const t = await team();
    for (let i = 0; i < VERIFY_LIMITS.member.max; i++) {
      const r = await runAsPrincipal(t.staffA, () =>
        verifyMemberQrAction({ shopId: t.shopA.id, token: "MQ1.junk" }),
      );
      expect(r.ok).toBe(true);
    }
    const over = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, token: "MQ1.junk" }),
    );
    expect(over).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  });

  it("[P1-14] the per-shop limit refuses a fresh team member once the shop's allowance is spent", async () => {
    const t = await team();
    for (let i = 0; i < VERIFY_LIMITS.shop.max; i++) {
      await limit({
        key: `action:memberQr.verify:shop:${t.shopA.id}`,
        ...VERIFY_LIMITS.shop,
        onError: "closed",
      });
    }
    const res = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, token: "MQ1.junk" }),
    );
    expect(res).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  });

  it("[P1-14] a team member over their own limit doesn't use up the shop's allowance (review M1)", async () => {
    // The member ceiling stays below the shop's, so one account can never lock the counter out on its own.
    expect((VERIFY_LIMITS.member.max * 3600) / VERIFY_LIMITS.member.windowSec).toBeLessThan(
      (VERIFY_LIMITS.shop.max * 3600) / VERIFY_LIMITS.shop.windowSec,
    );
    const t = await team();
    const colleague = await makeUser();
    await makeStaff(t.shopA.id, colleague.id, "staff");
    for (let i = 0; i < VERIFY_LIMITS.member.max + 5; i++) {
      await runAsPrincipal(t.staffA, () =>
        verifyMemberQrAction({ shopId: t.shopA.id, token: "MQ1.junk" }),
      );
    }
    const spent = await limiterRedis().zcard(
      limiterKey(`action:memberQr.verify:shop:${t.shopA.id}`),
    );
    expect(spent).toBe(VERIFY_LIMITS.member.max);
    const res = await runAsPrincipal(await principal(colleague.id), () =>
      verifyMemberQrAction({ shopId: t.shopA.id, token: "MQ1.junk" }),
    );
    expect(res).toEqual({ ok: true, data: { status: "invalid" } });
  });

  it("[P1-14] moz_rls reads only user_id, shop_id and left_at of memberships (0032)", async () => {
    const cols = await db().execute<{ column_name: string; privilege_type: string }>(sql`
      SELECT column_name, privilege_type FROM information_schema.column_privileges
      WHERE grantee = 'moz_rls' AND table_name = 'memberships' ORDER BY 1, 2`);
    expect([...cols]).toEqual([
      { column_name: "left_at", privilege_type: "SELECT" },
      { column_name: "shop_id", privilege_type: "SELECT" },
      { column_name: "user_id", privilege_type: "SELECT" },
    ]);
  });
});

describe("[P2-02] member verify for the scanner: typed member IDs, own card, award panel fields", () => {
  it("[P2-02] a typed member ID (any case, with or without the dash) finds a current member; others learn nothing", async () => {
    const t = await team();
    const ana = await customer("Ana Pereira");
    const lastVisitAt = new Date("2026-11-20T10:00:00Z");
    await makeMembership(ana.userId, t.shopA.id, {
      purchaseCount: 4,
      lastVisitAt,
      streakWeeks: 2,
      streakLastWeekStart: "2026-11-16",
    });
    for (const typed of [
      ana.memberId,
      formatMemberId(ana.memberId),
      ` ${ana.memberId.toLowerCase()} `,
    ]) {
      const res = await runAsPrincipal(t.staffA, () =>
        verifyMemberQrAction({ shopId: t.shopA.id, memberId: typed }),
      );
      expect(res, typed).toEqual({
        ok: true,
        data: {
          status: "ok",
          memberId: formatMemberId(ana.memberId),
          name: "Ana Pereira",
          purchaseCount: 4,
          lastVisitIso: lastVisitAt.toISOString(),
          streak: { weeks: 2, lastWeekStart: "2026-11-16" },
          openRequest: null,
        },
      });
    }
    // Another shop's staff typing the same ID, an unknown ID and a malformed one.
    const other = await runAsPrincipal(t.staffB, () =>
      verifyMemberQrAction({ shopId: t.shopB.id, memberId: ana.memberId }),
    );
    expect(other).toEqual({ ok: true, data: { status: "not_member" } });
    const unknown = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, memberId: "ZZZZZZ" }),
    );
    expect(unknown).toEqual({ ok: true, data: { status: "not_member" } });
    for (const bad of ["K7Q-42", "K7Q42M1", "I0O-1LL"]) {
      const res = await runAsPrincipal(t.staffA, () =>
        verifyMemberQrAction({ shopId: t.shopA.id, memberId: bad }),
      );
      expect(res, bad).toEqual({ ok: true, data: { status: "invalid" } });
    }
  });

  it("[P2-02] the input is a token or a member ID, never both, never neither", async () => {
    const t = await team();
    const both = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, token: "MQ1.junk", memberId: "K7Q42M" }),
    );
    expect(both).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const neither = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id }),
    );
    expect(neither).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const long = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, memberId: "K".repeat(17) }),
    );
    expect(long).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("[P2-02] a team member's own card is `self` (no award possible), by QR and by typed ID", async () => {
    const t = await team();
    const profile = await makeCustomerProfile(t.staffA.userId, { fullName: "Sam Staff" });
    await makeMembership(t.staffA.userId, t.shopA.id);
    const byQr = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, token: token(profile.memberId) }),
    );
    expect(byQr).toEqual({ ok: true, data: { status: "self" } });
    const byId = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, memberId: profile.memberId }),
    );
    expect(byId).toEqual({ ok: true, data: { status: "self" } });
  });

  it("[P2-02] a member's open request in this shop is named, so the scanner approves that one", async () => {
    const t = await team();
    const dee = await customer("Dee Hart");
    const m = await makeMembership(dee.userId, t.shopA.id);
    const [req] = await db()
      .insert(pointRequests)
      .values({
        shopId: t.shopA.id,
        membershipId: m.id,
        userId: dee.userId,
        idempotencyKey: randomUUID(),
      })
      .returning({ id: pointRequests.id });
    const res = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, memberId: dee.memberId }),
    );
    expect(res).toMatchObject({
      ok: true,
      data: { status: "ok", openRequest: { id: req?.id, awaitingOwner: false } },
    });

    // Sent to the owner (a staff member's over-limit award): the scanner says so instead of opening it.
    const eli = await customer("Eli Moss");
    const em = await makeMembership(eli.userId, t.shopA.id);
    const [waiting] = await db()
      .insert(pointRequests)
      .values({
        shopId: t.shopA.id,
        membershipId: em.id,
        userId: eli.userId,
        idempotencyKey: randomUUID(),
        status: "awaiting_owner",
      })
      .returning({ id: pointRequests.id });
    const toOwner = await runAsPrincipal(t.staffA, () =>
      verifyMemberQrAction({ shopId: t.shopA.id, memberId: eli.memberId }),
    );
    expect(toOwner).toMatchObject({
      ok: true,
      data: { status: "ok", openRequest: { id: waiting?.id, awaitingOwner: true } },
    });
  });
});
