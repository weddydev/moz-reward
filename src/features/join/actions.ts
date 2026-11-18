"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { requireCustomer } from "@/server/authz";
import { AppError, isAppError } from "@/server/errors";
import type { NewProfile } from "@/server/repos/profiles";
import { limitOrThrow, userKey } from "@/server/security/rate-limit";
import { joinShop } from "@/server/services/join";
import { parseUkMobile } from "@/server/services/phone";
import {
  BIRTHDAY_INVALID,
  cleanPersonName,
  OVER_13_REQUIRED,
  TOO_MANY_NEW_SHOPS,
  UK_MOBILE_ONLY,
  validBirthday,
} from "./profile-input";

type JoinShopResult = { shopId: string; membershipId: string; firstJoin: boolean };

/** Join calls per user per hour (re-scans included), and new memberships per user per day (P1-04 plan). */
const JOIN_CALLS = { max: 30, windowSec: 60 * 60 } as const;
const NEW_MEMBERSHIPS = { max: 50, windowSec: 24 * 60 * 60 } as const;

const profileInput = z
  .object({
    fullName: z.string().max(200),
    phone: z.string().max(40),
    birthdayDay: z.number().int().nullable(),
    birthdayMonth: z.number().int().nullable(),
    over13: z.literal(true, { error: OVER_13_REQUIRED }),
  })
  .strict()
  .transform((p, ctx): NewProfile => {
    const name = cleanPersonName(p.fullName);
    if (!name.ok) ctx.addIssue({ code: "custom", path: ["fullName"], message: name.message });
    const phone = parseUkMobile(p.phone);
    if (!phone.ok) ctx.addIssue({ code: "custom", path: ["phone"], message: UK_MOBILE_ONLY });
    const day = p.birthdayDay;
    const month = p.birthdayMonth;
    const birthdayGiven = day !== null || month !== null;
    const birthdayOk = day !== null && month !== null && validBirthday(day, month);
    if (birthdayGiven && !birthdayOk)
      ctx.addIssue({ code: "custom", path: ["birthday"], message: BIRTHDAY_INVALID });
    if (!name.ok || !phone.ok || (birthdayGiven && !birthdayOk)) return z.NEVER;
    return {
      fullName: name.value,
      phoneE164: phone.e164,
      birthday: birthdayOk ? { day, month } : null,
    };
  });

/**
 * "Collect points" → join (PRODUCT §3, P1-04): the join sheet's one call. The user comes from the session,
 * never the input; the profile (first join only) is validated and cleaned here (the sheet only mirrors it).
 * Two limits, both fail closed: 30 calls an hour, and 50 new memberships a day, counted only when a membership
 * is really created or re-opened (a re-scan costs nothing), checked inside the transaction so a refusal rolls
 * the join back.
 */
export const joinShopAction = defineAction({
  name: "join.shop",
  input: z
    .object({
      shopCode: z.string().min(1).max(20),
      marketingOptIn: z.boolean(),
      consentVersion: z.string().min(1).max(32),
      consentShopName: z.string().max(200),
      profile: profileInput.nullable(),
    })
    .strict(),
  authorize: (_input, p) => requireCustomer(p),
  rateLimit: { ...JOIN_CALLS, failMode: "closed" },
  transaction: true,
  audit: (input, _scope, result: JoinShopResult) =>
    result.firstJoin
      ? {
          action: "membership.join",
          entity: "membership",
          entityId: result.membershipId,
          meta: { shopId: result.shopId, marketingOptIn: input.marketingOptIn },
        }
      : null,
  handler: async (input, scope, { tx, afterCommit }): Promise<JoinShopResult> => {
    if (!tx) throw new Error("join.shop runs in a transaction");
    const result = await joinShop(scope, input, tx);
    // P1-A QA-MAJ1: the router kept the non-member landing from before the join, so browser back showed
    // "Collect points" and re-opened the profile form. Purging the client cache once the join has committed
    // makes back re-render the landing as a member (Next 16: from a Server Action this purges the client cache).
    afterCommit(() => {
      revalidatePath("/s/[code]", "page");
    });
    if (result.firstJoin) {
      try {
        await limitOrThrow({
          key: userKey("join.new-membership", scope.userId),
          ...NEW_MEMBERSHIPS,
          onError: "closed",
        });
      } catch (err) {
        if (isAppError(err) && err.code === "RATE_LIMITED")
          throw new AppError("RATE_LIMITED", TOO_MANY_NEW_SHOPS);
        throw err;
      }
    }
    return {
      shopId: result.shopId,
      membershipId: result.membershipId,
      firstJoin: result.firstJoin,
    };
  },
});
