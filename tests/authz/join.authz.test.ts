import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { joinShopAction } from "@/features/join/actions";
import { MARKETING_CONSENT_VERSION } from "@/features/join/consent";
import { runAsPrincipal } from "@/server/authz/principal";
import { testOwnerDb as db } from "@/server/db/client";
import { customerProfiles, memberships, shops } from "@/server/db/schema";
import { makeUser } from "@/server/testing/factories";
import { authzMatrix, type Role, world } from "./harness";

// "Collect points" (P1-04): any signed-in account may join a shop as a customer (PRODUCT §2), staff and admins
// included; the user always comes from the session. Anonymous is denied (the landing sends them to sign in).
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

/** The shop's code and the name its join sheet shows. */
const codeOf = async (shopId: string) => {
  const [row] = await db()
    .select({ code: shops.shopCode, name: shops.name, tradingName: shops.tradingName })
    .from(shops)
    .where(eq(shops.id, shopId));
  if (!row) throw new Error("shop missing");
  return { shopCode: row.code, consentShopName: row.tradingName ?? row.name };
};

const input = (
  shop: { shopCode: string; consentShopName: string },
  extra: Record<string, unknown> = {},
) => ({
  ...shop,
  marketingOptIn: false,
  consentVersion: MARKETING_CONSENT_VERSION,
  profile: {
    fullName: "Matrix Member",
    phone: "07400 123456",
    birthdayDay: null,
    birthdayMonth: null,
    over13: true as const,
  },
  ...extra,
});

authzMatrix("joinShopAction", {
  allow: SIGNED_IN,
  run: async (w) => joinShopAction(input(await codeOf(w.shopA.id))),
});

it("[P1-04] joinShopAction joins the caller only: a userId in the input is refused, nobody else is joined", async () => {
  const w = await world();
  const victim = await makeUser();
  const res = await runAsPrincipal(w.principals.customer, async () =>
    joinShopAction(input(await codeOf(w.shopB.id), { userId: victim.id })),
  );
  expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  expect(await db().select().from(memberships).where(eq(memberships.userId, victim.id))).toEqual(
    [],
  );
  expect(
    await db().select().from(customerProfiles).where(eq(customerProfiles.userId, victim.id)),
  ).toEqual([]);
});
