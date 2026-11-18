/**
 * Branded domain values (ENGINEERING §2, C-56). A brand exists only in the type system: at run time a
 * `ShopCode` is a plain string and `Points` a plain number. What the brand buys is that values which share a
 * shape can't be swapped by mistake: a member ID and a shop code use the same alphabet and length, and gold
 * and pence are both integers.
 *
 * Each brand has one minting place, so a branded value always passed its check:
 *  - `ShopCode`, `MemberId`: `normaliseShopCode` / `normaliseMemberId` and the generators in `./codes`;
 *    rows read from the database carry them through the schema's `$type`.
 *  - `ShopId`: `parseShopId` below, and `shops.id` through the schema.
 *  - `Points`, `Pence`: `points` / `pence` below, used by the loyalty engine (`./loyalty/engine`).
 */
declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** A shop's public 6-character code, as stored (upper case, no dash). */
export type ShopCode = Brand<string, "ShopCode">;
/** A customer's 6-character member ID, as stored (upper case, no dash). */
export type MemberId = Brand<string, "MemberId">;
/** `shops.id` (a UUID). */
export type ShopId = Brand<string, "ShopId">;
/** Whole gold (loyalty points); never negative. */
export type Points = Brand<number, "Points">;
/** Money in whole pence; never negative. */
export type Pence = Brand<number, "Pence">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A shop id from untrusted input (a route param, a payload), or null when it isn't a UUID. */
export function parseShopId(input: string): ShopId | null {
  return UUID.test(input) ? (input.toLowerCase() as ShopId) : null;
}

function wholeNonNegative(n: number, what: string): number {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`${what} must be a whole number ≥ 0, got ${String(n)}`);
  }
  return n;
}

/** Gold. Throws on a fraction, a negative, NaN or a number too big to count exactly. */
export const points = (n: number): Points => wholeNonNegative(n, "points") as Points;

/** Pence. Throws on a fraction, a negative, NaN or a number too big to count exactly. */
export const pence = (n: number): Pence => wholeNonNegative(n, "pence") as Pence;
