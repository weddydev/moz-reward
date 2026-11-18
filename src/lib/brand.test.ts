import { describe, expect, it } from "vitest";

import {
  type MemberId,
  type Pence,
  type Points,
  type ShopCode,
  type ShopId,
  parseShopId,
  pence,
  points,
} from "./brand";
import {
  formatMemberId,
  generateMemberId,
  generateShopCode,
  normaliseMemberId,
  normaliseShopCode,
} from "./codes";

// Type-level checks: `pnpm typecheck` fails if a swap below ever compiles (an unused @ts-expect-error is an
// error too), so these lines are the proof that brands can't be mixed (C-56).
const takesShopCode = (c: ShopCode): string => c;
const takesMemberId = (m: MemberId): string => m;
const takesShopId = (s: ShopId): string => s;
const takesPoints = (p: Points): number => p;
const takesPence = (p: Pence): number => p;

describe("[P1-06] branded domain types (C-56)", () => {
  it("never lets a member ID pass as a shop code, or gold as pence (typecheck)", () => {
    const member = generateMemberId();
    const shop = generateShopCode();
    const gold = points(10);
    const money = pence(450);

    // @ts-expect-error a member ID is not a shop code (same alphabet and length)
    takesShopCode(member);
    // @ts-expect-error a shop code is not a member ID
    takesMemberId(shop);
    // @ts-expect-error a plain string is not a shop code until normalised
    takesShopCode("K7Q42M");
    // @ts-expect-error a shop code is not a shop id
    takesShopId(shop);
    // @ts-expect-error pence are not gold
    takesPoints(money);
    // @ts-expect-error gold is not pence
    takesPence(gold);
    // @ts-expect-error a bare number is not gold
    takesPoints(10);

    // Each brand still reads as its base type.
    expect(takesShopCode(shop)).toHaveLength(6);
    expect(takesMemberId(member)).toHaveLength(6);
    expect(takesPoints(gold) + takesPence(money)).toBe(460);
  });

  it("mints codes only through the normalisers and generators", () => {
    expect(normaliseShopCode(" k7q-42m ")).toBe("K7Q42M");
    expect(normaliseShopCode("K7Q40M")).toBeNull();
    expect(normaliseMemberId("k7q 42m")).toBe("K7Q42M");
    expect(normaliseMemberId("K7Q42")).toBeNull();
    expect(generateShopCode()).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
    const id = generateMemberId();
    expect(id).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
    expect(formatMemberId(id)).toBe(`${id.slice(0, 3)}-${id.slice(3)}`);
  });

  it("parses a shop id only from a UUID, lower-cased", () => {
    const uuid = "6F1C2B9E-4A3D-4C5B-9E8F-0A1B2C3D4E5F";
    const parsed = parseShopId(uuid);
    expect(parsed).toBe(uuid.toLowerCase());
    if (parsed) expect(takesShopId(parsed)).toBe(uuid.toLowerCase());
    for (const bad of ["", "K7Q42M", `${uuid}x`, "6f1c2b9e-4a3d-4c5b-9e8f-0a1b2c3d4e5"]) {
      expect(parseShopId(bad), bad).toBeNull();
    }
  });

  it("refuses gold or pence that is negative, fractional, not a number or too big to count exactly", () => {
    expect(points(0)).toBe(0);
    expect(pence(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    for (const bad of [
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => points(bad), String(bad)).toThrow(RangeError);
      expect(() => pence(bad), String(bad)).toThrow(RangeError);
    }
  });
});
