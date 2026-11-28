/**
 * Points-request limits and reasons shared by the database schema, the action inputs and the shop's approve and
 * reject forms (P1-12). Plain values only, so client components can use them without the schema module.
 */

/** Preset reasons a shop rejects a request with (PRODUCT §5); `reject_note` holds optional free text. */
export const REJECT_REASONS = [
  "no_purchase",
  "not_recognised",
  "already_awarded",
  "wrong_shop",
  "other",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

/** Items on one award (approve form): at most this many, each at most this long (receipt lines). */
export const REQUEST_ITEMS = { max: 10, maxLength: 40 } as const;
/** Free-text limit for a reject note (shop-only; disclosed under a DSAR). */
export const REJECT_NOTE_MAX = 200;
/** Absurd-number bound on an amount spent (£100,000); the platform cap is checked by the service and the DB. */
export const AMOUNT_PENCE_MAX = 10_000_000;

/** An owner-configured quick-pick on the approve form (shop settings, P2-05): an item and, when set, its usual price. */
export type QuickPick = { label: string; pricePence: number | null };
/** At most this many quick-picks per shop, each label as long as an award's item may be (REQUEST_ITEMS). */
export const QUICK_PICKS = { max: 8, labelMax: REQUEST_ITEMS.maxLength } as const;

/** A request expires 24 h after the server received it (PRODUCT §5); the expiry job marks it within 5 minutes. */
export const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
