import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { mintShopScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import type * as NotifyModule from "@/server/notifications/notify";
import { limiterRedis } from "@/server/security/rate-limit";
import { reserveRedeemAttempt } from "@/server/security/redeem-guard";
import { confirmRedemption } from "@/server/services/redemptions";
import { makeShop, makeStaff, makeUser } from "@/server/testing/factories";

/** The owners' notice fails once (a database error inside its transaction), then works. */
const failing = vi.hoisted(() => ({ times: 0 }));
vi.mock("@/server/notifications/notify", async (importOriginal) => {
  const real = await importOriginal<typeof NotifyModule>();
  return {
    ...real,
    notify: async (...args: Parameters<typeof real.notify>) => {
      if (failing.times > 0) {
        failing.times--;
        throw new Error("notice insert failed");
      }
      return real.notify(...args);
    },
  };
});

/**
 * P1-16 security review LOW 1 (P1-18): when the shop's guessing budget runs out, the owners are told once. If that
 * notice's transaction fails, the team member still gets the 429 (not a 500), and the shop's "told" flag is
 * cleared, so the next refusal tells the owners instead of 24 h of silence.
 */
describe("[P1-18] redeem paused notice failure", () => {
  it("[P1-18] a failed owner notice still answers 429 and is retried by the next refusal", async () => {
    const shop = await makeShop({ status: "active" });
    const [ownerUser, staffUser] = await Promise.all([makeUser(), makeUser()]);
    await Promise.all([
      makeStaff(shop.id, ownerUser.id, "owner"),
      makeStaff(shop.id, staffUser.id, "staff"),
    ]);
    const staff = mintShopScope({ userId: staffUser.id, shopId: shop.id, role: "staff" });
    // Spend the shop's whole budget straight through the guard (other team members' wrong codes), at the
    // weight the service's own attempt will have (no live codes: 2), so that one is refused too…
    for (let i = 0; i < 1_000; i++) {
      const d = await reserveRedeemAttempt({
        shopId: shop.id,
        staffId: `filler-${String(Math.floor(i / 4))}`,
        liveCodes: 0,
      });
      if (d.kind === "shop_exhausted") break;
    }
    // …and forget that refusal, so the service's next one is the shop's first.
    await limiterRedis().del(`${env().REDIS_KEY_PREFIX}redeem:shop:${shop.id}:told`);

    const audited = async () =>
      (
        await db()
          .select()
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.action, "redemption.budget_exhausted"),
              eq(auditLogs.entityId, shop.id),
            ),
          )
      ).length;

    failing.times = 1;
    const first = await confirmRedemption(staff, "ZZZZZZ").catch((e: unknown) => e);
    expect(first).toBeInstanceOf(AppError);
    expect((first as AppError).code).toBe("RATE_LIMITED");
    expect((first as AppError).message).toMatch(/paused/);
    expect(await audited()).toBe(0); // the notice's transaction rolled back with its audit row

    const second = await confirmRedemption(staff, "ZZZZZZ").catch((e: unknown) => e);
    expect((second as AppError).code).toBe("RATE_LIMITED");
    expect(await audited()).toBe(1); // told now, once

    const third = await confirmRedemption(staff, "ZZZZZZ").catch((e: unknown) => e);
    expect((third as AppError).code).toBe("RATE_LIMITED");
    expect(await audited()).toBe(1);
  });
});
