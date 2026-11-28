import { pence } from "@/lib/brand";
import { calculateAward, type StreakState } from "@/lib/loyalty/engine";
import { type ProgrammeVersion, versionActiveAt } from "@/lib/loyalty/programme";
import { AMOUNT_PENCE_MAX, type QuickPick, REQUEST_ITEMS } from "@/lib/requests";

export type { QuickPick };

/**
 * The approve panel's own logic (P2-02, PRODUCT §5, DESIGN §15 screen 18): the phone number pad, the item
 * quick-picks and the live gold preview. Pure: the panel renders these and the server decides again on submit
 * (`approveRequest` prices the award from the same engine under a row lock), so the preview is a guide, never
 * the award.
 */

export const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;
export type PadKey = (typeof PAD_KEYS)[number];

/** Digits before the point: AMOUNT_PENCE_MAX (£100,000) is the largest amount a request may carry. */
const WHOLE_DIGITS = String(Math.floor(AMOUNT_PENCE_MAX / 100)).length;

/**
 * The amount as typed on the pad (pounds, `12.5`): digits, one point, two decimals at most, no leading zeros,
 * at most AMOUNT_PENCE_MAX. A key that would break those rules changes nothing.
 */
export function padPress(text: string, key: PadKey): string {
  if (key === "back") return text.slice(0, -1);
  if (key === ".") {
    if (text.includes(".")) return text;
    return text === "" ? "0." : `${text}.`;
  }
  const [whole = "", frac] = text.split(".");
  if (frac !== undefined) {
    if (frac.length >= 2) return text;
    const next = `${text}${key}`;
    return Math.round(Number(next) * 100) > AMOUNT_PENCE_MAX ? text : next;
  }
  if (whole === "0") return key; // "0" then "5" is "5", never "05"
  if (whole.length >= WHOLE_DIGITS) return text;
  const next = `${whole}${key}`;
  return Number(next) * 100 > AMOUNT_PENCE_MAX ? text : next;
}

/** How the pad's text reads on screen: `£12.50`-style while typing (`£12.5` stays as typed), `£0` when empty. */
export const padDisplay = (text: string): string => `£${text === "" ? "0" : text}`;

export type PickState = {
  /** The chosen quick-pick labels, in the order chosen. */
  picked: string[];
  /** The amount as text (pounds); follows the picked prices until the person types an amount. */
  amount: string;
  /** True once the amount was typed by hand: picks then change only the items, never the amount. */
  typed: boolean;
};

const poundsText = (p: number): string => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

/**
 * Toggles a quick-pick: adds or removes the item, and (until the amount was typed by hand) sets the amount to
 * the sum of the chosen items' prices. More than REQUEST_ITEMS.max items, or a sum above AMOUNT_PENCE_MAX,
 * changes nothing.
 */
export function togglePick(
  state: PickState,
  pick: QuickPick,
  picks: readonly QuickPick[],
): PickState {
  const on = state.picked.includes(pick.label);
  const picked = on ? state.picked.filter((l) => l !== pick.label) : [...state.picked, pick.label];
  if (picked.length > REQUEST_ITEMS.max) return state;
  if (state.typed) return { ...state, picked };
  const sum = picked.reduce(
    (total, label) => total + (picks.find((p) => p.label === label)?.pricePence ?? 0),
    0,
  );
  if (sum > AMOUNT_PENCE_MAX) return state;
  return { picked, amount: sum === 0 ? "" : poundsText(sum), typed: false };
}

/** Items for the award: the chosen quick-picks first, then anything typed (comma separated), without repeats. */
export function mergeItems(picked: readonly string[], typed: readonly string[]): string[] {
  const seen = new Set<string>();
  return [...picked, ...typed].filter((i) => {
    const k = i.toLocaleLowerCase("en-GB");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export type PreviewContext = {
  versions: readonly ProgrammeVersion[];
  requestedAt: Date;
  streak: StreakState;
  /** The platform cap per award (PRODUCT §5); the server refuses above it, even for owners. */
  cap: { pence: number; gold: number };
  /** A staff member's per-award limit; null for owners and unlimited staff. */
  limit: number | null;
};

export type GoldPreview =
  | { kind: "no-programme" }
  | { kind: "needs-amount" }
  | { kind: "no-gold" }
  | { kind: "over-cap" }
  | {
      kind: "gold";
      gold: number;
      streakBonus: number;
      /** Above the staff member's limit: the request goes to the owner instead of being awarded. */
      toOwner: boolean;
    };

/**
 * The gold this approval would add, from the same engine the server uses (rules active at `requestedAt`,
 * streak bonus). Happy hour and other multipliers join here with the server's when P3-05 builds them.
 */
export function previewGold(ctx: PreviewContext, amountPence: number | null): GoldPreview {
  const rules = versionActiveAt(ctx.versions, ctx.requestedAt);
  if (!rules) return { kind: "no-programme" };
  if (rules.earnMode === "per_pound" && amountPence === null) return { kind: "needs-amount" };
  if (amountPence !== null && amountPence > ctx.cap.pence) return { kind: "over-cap" };
  const award = calculateAward({
    versions: ctx.versions,
    amountPence: amountPence === null ? null : pence(amountPence),
    requestedAt: ctx.requestedAt,
    multipliers: [],
    streak: ctx.streak,
  });
  if (award.earned <= 0) return { kind: "no-gold" };
  if (award.total > ctx.cap.gold) return { kind: "over-cap" };
  return {
    kind: "gold",
    gold: award.total,
    streakBonus: award.streakBonus,
    toOwner: ctx.limit !== null && award.total > ctx.limit,
  };
}
