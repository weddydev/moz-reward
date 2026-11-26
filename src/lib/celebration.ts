/**
 * Celebrations (P1-15; DESIGN §8.2, §8.4, §8.5): what the customer's "points credited" moment shows, as pure
 * data and text, shared by the server (which claims and builds it) and the lazy client chunk (which plays it).
 * No personal data: shop identity, gold, the purchase amount and the receipt the customer already owns.
 */
import { ingotPercent } from "@/lib/loyalty/ingot";
import { formatPence } from "@/lib/money";

/** An approval older than this is not celebrated on app open (it is in the Wallet and the receipts already). */
export const CELEBRATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

export type CelebrationReward = { id: string; label: string; kind: "main" | "milestone" };

export type CelebrationReceipt = {
  id: string;
  number: number;
  shopName: string;
  address: string | null;
  vatNumber: string | null;
  approvedAt: string;
  items: string[];
  amountPence: number | null;
  goldEarned: number;
  bonusGold: number;
  staffInitials: string;
};

export type Celebration = {
  requestId: string;
  shop: { id: string; name: string; logoUrl: string | null; code: string };
  /** Gold this approval added (earn + streak bonus). */
  gold: number;
  amountPence: number | null;
  /** The ingot being filled: gold before, gold after (in the next ingot when one filled), its size. */
  ingot: { from: number; to: number; size: number; ingotsBefore: number; filled: number };
  /** The reward the ingot was for ("Free coffee & cake"). */
  title: string;
  /** Gold a usual visit earns ("about N visits"); null when gold is earned per £1. */
  perVisit: number | null;
  rewards: CelebrationReward[];
  receipt: CelebrationReceipt | null;
};

/** The moment's timing (DESIGN §8.2: ≈ 1.6 s; the pour itself is the vault's, `POUR` / `VAULT`). */
export const CELEBRATION = {
  /** The pour starts once the sheet has risen (its own enter transition is ≤ 300 ms). */
  pourDelayMs: 320,
  /** "+80 gold" counts up (tabular numbers, Fraunces), then the shimmer passes once. */
  countMs: 700,
  shimmerMs: 900,
  /** 8–12 tiny gold particles drift up and fade (capped; DESIGN §8.2 step 4). */
  particles: { count: 10, speed: [40, 110] as const, spread: 0.9, life: [0.7, 1.1] as const },
} as const;

/** The receipt "prints" (DESIGN §8.5): customer 800 ms with the stamp press; dashboard 400 ms, no stamp bounce. */
export const RECEIPT_PRINT = {
  ms: 800,
  fromY: 24,
  dashboardMs: 400,
  stamp: { ms: 160, from: 1.15, delayMs: 560 },
} as const;

const gb = (n: number): string => Math.round(n).toLocaleString("en-GB");
const plural = (n: number, word: string): string => `${gb(n)} ${word}${n === 1 ? "" : "s"}`;

/** "+80 gold". */
export const goldText = (gold: number): string => `+${gb(gold)} gold`;

/** "Brew & Bloom Café · £8.40 purchase", or the shop alone when no amount was entered. */
export const purchaseLine = (shopName: string, amountPence: number | null): string =>
  amountPence !== null && amountPence > 0
    ? `${shopName} · ${formatPence(amountPence)} purchase`
    : shopName;

/**
 * Where the ingot stands after the approval: "80% full · about 1 more visit", "80% full · 200 gold to go" (gold
 * per £1), or after a fill "Ingot filled · 10% into the next one".
 */
export function progressLine(
  ingot: Pick<Celebration["ingot"], "to" | "size" | "filled">,
  perVisit: number | null,
): string {
  const after = Math.max(0, Math.min(ingot.size, ingot.to));
  const percent = ingotPercent(after, ingot.size);
  if (ingot.filled > 0) {
    const filled = ingot.filled > 1 ? `${gb(ingot.filled)} ingots filled` : "Ingot filled";
    return `${filled} · ${String(percent)}% into the next one`;
  }
  const left = Math.max(0, ingot.size - after);
  if (left === 0) return "100% full · your reward is ready";
  if (perVisit !== null && perVisit > 0)
    return `${String(percent)}% full · about ${plural(Math.ceil(left / perVisit), "more visit")}`;
  return `${String(percent)}% full · ${gb(left)} gold to go`;
}

/** What the polite live region says when the moment opens (animations never carry information alone). */
export function announcement(c: Celebration): string {
  const reward =
    c.rewards.length === 0
      ? ""
      : c.rewards.length === 1
        ? ` Reward unlocked: ${c.rewards[0]?.label ?? ""}.`
        : ` ${gb(c.rewards.length)} rewards unlocked.`;
  // Commas, not "·": some screen readers read the dot aloud ("middle dot").
  const progress = progressLine(c.ingot, c.perVisit).replaceAll(" · ", ", ");
  return `${goldText(c.gold)} at ${c.shop.name}. ${progress}.${reward}`;
}

/** The Share sheet's text (no personal data; the link is the shop's public page). */
export const shareText = (c: Pick<Celebration, "gold" | "shop">): string =>
  `I just collected ${gb(c.gold)} gold at ${c.shop.name} with Moz Rewards.`;

export type UnseenApproval = { id: string; decidedAt: Date; hasSnapshot: boolean };

/**
 * Which of the approvals just claimed to celebrate: the newest one with an ingot snapshot, decided within the
 * window. Older ones are claimed (seen) but not replayed: one moment per app open, never a queue of them.
 */
export function pickCelebration<T extends UnseenApproval>(
  claimed: readonly T[],
  now: Date,
): T | null {
  let best: T | null = null;
  for (const a of claimed) {
    if (!a.hasSnapshot) continue;
    if (now.getTime() - a.decidedAt.getTime() > CELEBRATION_WINDOW_MS) continue;
    if (!best || a.decidedAt.getTime() > best.decidedAt.getTime()) best = a;
  }
  return best;
}

/** The receipt's print (DESIGN §8.5): up from 24 px while a clip reveals it from the top down. */
export const printKeyframes = (): Keyframe[] => [
  { transform: `translateY(${String(RECEIPT_PRINT.fromY)}px)`, clipPath: "inset(0 0 100% 0)" },
  { transform: "none", clipPath: "inset(0 0 0 0)" },
];

/** The gold stamp presses in (scale 1.15 → 1, 160 ms); it keeps its tilt. */
export const stampKeyframes = (): Keyframe[] => [
  { opacity: 0, transform: `rotate(-8deg) scale(${String(RECEIPT_PRINT.stamp.from)})` },
  { opacity: 1, transform: "rotate(-8deg) scale(1)" },
];

/** The stored receipt snapshot (`receipts.data`, P1-12): what a receipt shows, with no customer data. */
export type ReceiptSnapshot = Omit<CelebrationReceipt, "id" | "number">;

/** A receipt row (id, number, snapshot) as the card shows it. */
export const receiptView = (r: {
  id: string;
  number: number;
  data: ReceiptSnapshot;
}): CelebrationReceipt => ({
  id: r.id,
  number: r.number,
  shopName: r.data.shopName,
  address: r.data.address,
  vatNumber: r.data.vatNumber,
  approvedAt: r.data.approvedAt,
  items: [...r.data.items],
  amountPence: r.data.amountPence,
  goldEarned: r.data.goldEarned,
  bonusGold: r.data.bonusGold,
  staffInitials: r.data.staffInitials,
});
