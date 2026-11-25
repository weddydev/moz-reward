import { addressLine, statusLabel } from "@/features/landing/view";
import type { ShopId } from "@/lib/brand";
import { points } from "@/lib/brand";
import { formatDate } from "@/lib/format-date";
import { estimateVisitsToNext, initialMemberState } from "@/lib/loyalty/engine";
import { ingotPercent } from "@/lib/loyalty/ingot";
import { ingotTerms, type ProgrammeVersion } from "@/lib/loyalty/programme";
import { type ClosureRow, type HoursRow, openStatus } from "@/lib/open-status";
import { londonDate, londonWall } from "@/lib/time";

/**
 * Pure view logic for the Wallet (P1-07, PRODUCT §4, DESIGN §15 screen 3). Copy is UK English (DESIGN §14).
 */

/** A "N more visits" estimate shows only after this many approved visits (fewer is too little history). */
export const RELIABLE_ESTIMATE_VISITS = 3;

export type WalletSortKey = {
  name: string;
  membershipId: string;
  purchaseCount: number;
  progressGold: number;
  lastVisitAt: Date | null;
};

/**
 * PRODUCT §4: purchase count desc → current points desc → last visit desc (never-visited last). Then shop name
 * and membership id, so equal cards keep one order between renders (not in the spec; DECISIONS 18 Nov).
 */
export function compareWallet(a: WalletSortKey, b: WalletSortKey): number {
  return (
    b.purchaseCount - a.purchaseCount ||
    b.progressGold - a.progressGold ||
    (b.lastVisitAt?.getTime() ?? -Infinity) - (a.lastVisitAt?.getTime() ?? -Infinity) ||
    a.name.localeCompare(b.name, "en-GB") ||
    (a.membershipId < b.membershipId ? -1 : a.membershipId > b.membershipId ? 1 : 0)
  );
}

export const sortWallet = <T extends WalletSortKey>(cards: readonly T[]): T[] =>
  [...cards].sort(compareWallet);

export { ingotPercent };

/**
 * The card's progress label: "72% · 1 more visit". The visits part only when the estimate is reliable (at least
 * `RELIABLE_ESTIMATE_VISITS` approved visits and an estimate); a shop without a programme says so instead.
 */
const NOT_SET_UP = "Rewards not set up yet";

export function progressLabel(input: {
  progressGold: number;
  ingotSize: number | null;
  approvedVisits: number;
  visitsToNext: number | null;
}): string {
  if (input.ingotSize === null) return NOT_SET_UP;
  const pct = `${String(ingotPercent(input.progressGold, input.ingotSize))}%`;
  const n = input.visitsToNext;
  if (input.approvedVisits < RELIABLE_ESTIMATE_VISITS || n === null || !(n >= 1)) return pct;
  return `${pct} · ${String(n)} more ${n === 1 ? "visit" : "visits"}`;
}

/**
 * The Wallet header (reference `.w-head`): `part` is "Good morning" before 12:00, "Good afternoon" before 18:00,
 * else "Good evening" (London time), shown small above the first name; `name` is null when there is none.
 */
export function greeting(
  now: Date,
  firstName: string | null,
): { part: string; name: string | null } {
  const hour = new Date(londonWall(now.getTime())).getUTCHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return { part, name: firstName };
}

/** First word of the profile's full name, or null when there is none. */
export const firstNameOf = (fullName: string | null | undefined): string | null =>
  fullName?.trim().split(/\s+/)[0] || null;

export type Availability = "live" | "suspended" | "closed";

/** What a suspended or closed shop's card says instead of opening hours (same words as the landing page). */
export const AVAILABILITY_TEXT: Readonly<Record<Exclude<Availability, "live">, string>> = {
  suspended: "Taking a break",
  closed: "No longer on Moz Rewards",
};

export type WalletCardInput = {
  membershipId: string;
  shopId: ShopId;
  name: string;
  addressLine1: string | null;
  town: string | null;
  postcode: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  status: string;
  joinedAt: Date;
  purchaseCount: number;
  lastVisitAt: Date | null;
  progressGold: number;
  ingotsCompleted: number;
  /** When the current ingot started (null = at `joinedAt`, C-60): its terms are the version in force then. */
  ingotStartedAt: Date | null;
  /** Gold reversed beyond the progress there was; future earns pay it off first. */
  goldShortfall: number;
  versions: readonly ProgrammeVersion[];
  hours: readonly HoursRow[];
  closures: readonly ClosureRow[];
  /** Gold of the most recent approved awards, oldest first (the ledger's last earns, C-62). */
  recentAwards: readonly number[];
};

export type WalletCard = {
  membershipId: string;
  shopId: ShopId;
  name: string;
  address: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  availability: Availability;
  /** 0–1 of the current ingot (0 without a programme). */
  progress: number;
  progressGold: number;
  ingotSize: number | null;
  /** Percent and visits hint ("72% · 1 more visit"): the card's accessible name. */
  label: string;
  /** The visible line (reference `.wc-meta`): "720 / 1,000 · Free coffee & cake", or the not-set-up text. */
  meta: string;
  /** The main reward the current ingot fills towards; null without a programme. */
  reward: string | null;
  ingotsCompleted: number;
  /** Opening status for live shops with hours; null otherwise. */
  open: { tone: "open" | "closed"; text: string } | null;
} & WalletSortKey;

export function walletCard(input: WalletCardInput, now: Date): WalletCard {
  const state = {
    ...initialMemberState(input.ingotStartedAt ?? input.joinedAt),
    progress: points(input.progressGold),
    ingotsCompleted: input.ingotsCompleted,
    shortfall: points(input.goldShortfall),
  };
  const terms = input.versions.length ? ingotTerms(input.versions, state.ingotStartedAt) : null;
  const ingotSize = terms?.ingotSize ?? null;
  const visitsToNext =
    terms && input.recentAwards.length
      ? estimateVisitsToNext(
          state,
          input.recentAwards.map((g) => points(g)),
          input.versions,
        )
      : null;
  const availability: Availability =
    input.status === "suspended" || input.status === "closed" ? input.status : "live";
  const open =
    availability === "live" && input.hours.length > 0
      ? statusLabel(
          openStatus({ hours: input.hours, closures: input.closures }, now),
          londonDate(now),
        )
      : null;
  return {
    membershipId: input.membershipId,
    shopId: input.shopId,
    name: input.name,
    address: addressLine([input.addressLine1, input.town ?? input.postcode]),
    logoUrl: input.logoUrl,
    coverUrl: input.coverUrl,
    availability,
    progress: ingotSize ? ingotPercent(input.progressGold, ingotSize) / 100 : 0,
    progressGold: input.progressGold,
    ingotSize,
    label: progressLabel({
      progressGold: input.progressGold,
      ingotSize,
      approvedVisits: input.purchaseCount,
      visitsToNext,
    }),
    meta: terms
      ? `${input.progressGold.toLocaleString("en-GB")} / ${terms.ingotSize.toLocaleString("en-GB")} · ${terms.mainReward.text}`
      : NOT_SET_UP,
    reward: terms?.mainReward.text ?? null,
    ingotsCompleted: input.ingotsCompleted,
    open,
    purchaseCount: input.purchaseCount,
    lastVisitAt: input.lastVisitAt,
  };
}

/** One approved visit in the right column's recent activity. */
export type WalletActivityRow = {
  requestId: string;
  shopId: string;
  shopName: string;
  /** "+120 gold" (earn plus any streak bonus of that visit). */
  gold: string;
  /** "26 Nov 2026". */
  date: string;
};

export type WalletView = {
  cards: WalletCard[];
  /** `gold` and `shops`: the total panel (reference `.total`); the rest: the summary row. */
  summary: { rewardsReady: number; ingotsCompleted: number; gold: number; shops: number };
  /** The last approved visits across the current memberships, newest first (C-62). */
  activity: WalletActivityRow[];
};

/**
 * Cards in Wallet order plus the summary (rewards ready from the rewards table, C-62) and the recent activity.
 * The total gold is the sum of the gold the cards show: a shop without a programme shows none, so none of its
 * stored balance counts. An activity row whose shop isn't among the cards (it can't happen: both come from the
 * current memberships) is dropped rather than shown without a name.
 */
export function walletView(
  inputs: readonly WalletCardInput[],
  rewardsReady: number,
  now: Date,
  activity: readonly { shopId: string; requestId: string; gold: number; at: Date }[] = [],
): WalletView {
  const cards = sortWallet(inputs.map((i) => walletCard(i, now)));
  const names = new Map<string, string>(inputs.map((i) => [i.shopId, i.name]));
  return {
    cards,
    activity: activity.flatMap((a) => {
      const shopName = names.get(a.shopId);
      return shopName === undefined
        ? []
        : [
            {
              requestId: a.requestId,
              shopId: a.shopId,
              shopName,
              gold: `+${a.gold.toLocaleString("en-GB")} gold`,
              date: formatDate(a.at),
            },
          ];
    }),
    summary: {
      rewardsReady,
      ingotsCompleted: cards.reduce((sum, c) => sum + c.ingotsCompleted, 0),
      gold: cards.reduce((sum, c) => sum + (c.ingotSize ? c.progressGold : 0), 0),
      shops: cards.length,
    },
  };
}

/** "1 reward" / "3 rewards". */
export const rewardsText = (n: number): string =>
  `${n.toLocaleString("en-GB")} ${n === 1 ? "reward" : "rewards"}`;

/** "1 ingot filled" / "3 ingots filled". */
export const ingotsText = (n: number): string =>
  `${n.toLocaleString("en-GB")} ${n === 1 ? "ingot" : "ingots"} filled`;

/** The total panel's label under the number: "gold across 3 shops" / "gold across 1 shop". */
export const totalText = (shops: number): string =>
  `gold across ${shops.toLocaleString("en-GB")} ${shops === 1 ? "shop" : "shops"}`;

/** "720 / 1,000 gold". */
export const goldText = (gold: number, size: number): string =>
  `${gold.toLocaleString("en-GB")} / ${size.toLocaleString("en-GB")} gold`;

/** Cards per stack on phones (DESIGN §6.4: long lists stack in groups of three, with "Show all"). */
export const STACK_SIZE = 3;

/** The Wallet's cards cut into stacks of `size`, in order; the last stack holds what is left. */
export function stackGroups<T>(cards: readonly T[], size: number = STACK_SIZE): T[][] {
  if (!(size >= 1) || !Number.isInteger(size))
    throw new Error(`stackGroups: size must be ≥ 1, got ${String(size)}`);
  const out: T[][] = [];
  for (let i = 0; i < cards.length; i += size) out.push(cards.slice(i, i + size));
  return out;
}
