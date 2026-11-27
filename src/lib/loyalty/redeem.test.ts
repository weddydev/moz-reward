import { describe, expect, it } from "vitest";
import {
  REDEEM,
  guessChance,
  rewardExpiresAt,
  rewardState,
  shopRedeemable,
  validUntilDate,
} from "./redeem";

const at = (iso: string): Date => new Date(iso);

describe("[P1-16] reward validity", () => {
  it("lasts to the end of the London day N days after unlock (GMT)", () => {
    // Unlocked 10:00 on 2 Jan 2027 (GMT) → valid through 2 Apr 2027 → ends 00:00 BST on 3 Apr = 23:00 UTC 2 Apr.
    const exp = rewardExpiresAt(at("2027-01-02T10:00:00Z"), 90);
    expect(exp.toISOString()).toBe("2027-04-02T23:00:00.000Z");
    expect(validUntilDate(exp)).toBe("2027-04-02");
  });

  it("an unlock just after midnight London in summer counts from the London date", () => {
    // 23:30 UTC on 1 Jul = 00:30 BST on 2 Jul → valid through 30 Sep → ends 00:00 BST 1 Oct = 23:00 UTC 30 Sep.
    const exp = rewardExpiresAt(at("2027-07-01T23:30:00Z"), 90);
    expect(exp.toISOString()).toBe("2027-09-30T23:00:00.000Z");
    expect(validUntilDate(exp)).toBe("2027-09-30");
  });

  it("refuses validity outside 90–365 days", () => {
    expect(() => rewardExpiresAt(at("2027-01-01T00:00:00Z"), 89)).toThrow(
      new RangeError("reward validity must be 90–365 days"),
    );
    expect(() => rewardExpiresAt(at("2027-01-01T00:00:00Z"), 366)).toThrow(RangeError);
    expect(() => rewardExpiresAt(at("2027-01-01T00:00:00Z"), 90.5)).toThrow(RangeError);
    expect(REDEEM.validDays).toEqual({ default: 90, min: 90, max: 365 });
  });
});

describe("[P1-16] reward state", () => {
  const expiresAt = at("2027-04-02T23:00:00Z");
  it("ready until its expiry, expired at and after it, redeemed wins", () => {
    expect(rewardState({ expiresAt, redeemedAt: null }, at("2027-04-02T22:59:59Z"))).toBe("ready");
    expect(rewardState({ expiresAt, redeemedAt: null }, expiresAt)).toBe("expired");
    expect(rewardState({ expiresAt, redeemedAt: at("2027-03-01T10:00:00Z") }, expiresAt)).toBe(
      "redeemed",
    );
  });
});

describe("[P1-16] shop state matrix for redeeming (PRODUCT §15)", () => {
  const now = at("2027-03-01T12:00:00Z");
  it("active, expiring, grace and restricted redeem; pending and suspended don't", () => {
    for (const status of ["active", "expiring", "grace", "restricted"] as const)
      expect(shopRedeemable({ status, closedAt: null }, now)).toBe(true);
    for (const status of ["pending", "suspended"] as const)
      expect(shopRedeemable({ status, closedAt: null }, now)).toBe(false);
  });

  it("closed: for 30 days after closure, then no; a closed shop without a closure time is refused", () => {
    const d29 = new Date(now.getTime() - 29 * 86_400_000);
    const d30 = new Date(now.getTime() - 30 * 86_400_000);
    expect(shopRedeemable({ status: "closed", closedAt: d29 }, now)).toBe(true);
    expect(shopRedeemable({ status: "closed", closedAt: d30 }, now)).toBe(false);
    expect(shopRedeemable({ status: "closed", closedAt: null }, now)).toBe(false);
  });
});

describe("[P1-16] guessing budget (SECURITY §6: below 1 in 1,000,000 per shop per day)", () => {
  it("the code space is 30^6 and the full budget stays under one in a million", () => {
    expect(REDEEM.codeSpace).toBe(30 ** 6);
    expect(guessChance(REDEEM.shopGuessBudget)).toBeLessThan(1e-6);
    // The budget is not set wastefully low either: within 5% of the bound.
    expect(guessChance(REDEEM.shopGuessBudget)).toBeGreaterThan(0.95e-6);
  });

  it("any run of attempts the budget admits stays under the bound (union bound over Σ live codes)", () => {
    // Each attempt is admitted only while the running weight (live codes at each attempt) stays within budget.
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let run = 0; run < 200; run++) {
      let used = 0;
      for (let i = 0; i < 2_000; i++) {
        const live = Math.floor(rnd() * 40);
        if (used + live > REDEEM.shopGuessBudget) continue;
        used += live;
      }
      expect(guessChance(used)).toBeLessThan(1e-6);
    }
  });
});
