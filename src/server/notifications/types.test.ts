import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineNotificationType, EMAIL_BUDGET, NOTIFICATION_TYPES } from "./types";

describe("[P1-10] notification types", () => {
  it("every P1 type is transactional and in-app only (no email outside the budget list)", () => {
    for (const [name, def] of Object.entries(NOTIFICATION_TYPES)) {
      expect({ name, category: def.category, email: def.email }).toEqual({
        name,
        category: "transactional",
        email: null,
      });
    }
  });

  it("refuses an email channel that is not on the email budget list", () => {
    expect(() =>
      defineNotificationType({
        category: "transactional",
        // @ts-expect-error -- not a budget kind: refused by the type and at runtime
        email: "points_credited",
        payload: z.object({}),
      }),
    ).toThrow(/email budget/);
    expect(
      defineNotificationType({
        category: "transactional",
        email: "security_notice",
        payload: z.object({}),
      }).email,
    ).toBe("security_notice");
    expect(EMAIL_BUDGET).toContain("staff_invite");
  });

  it("refuses marketing until the consent gate exists (P3-07)", () => {
    expect(() => defineNotificationType({ category: "marketing", payload: z.object({}) })).toThrow(
      /consent/,
    );
  });

  it("payloads are strict: names, emails or amounts are refused", () => {
    const schema = NOTIFICATION_TYPES.loyalty_change_notice.payload;
    const ok = {
      shopId: "0190a8f0-0000-7000-8000-000000000001",
      version: 2,
      rewardsFrom: "2026-12-09T10:00:00.000Z",
    };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ ...ok, shopName: "Moz Café" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, email: "a@b.co" }).success).toBe(false);
  });
});
