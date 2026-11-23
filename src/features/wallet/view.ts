import { addressLine, statusLabel } from "@/features/landing/view";
import type { ShopId } from "@/lib/brand";
import { points } from "@/lib/brand";
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
export function progressLabel(input: {
  progressGold: number;
  ingotSize: number | null;
  approvedVisits: number;
  visitsToNext: number | null;
}): string {
  if (input.ingotSize === null) return "Rewards not set up yet";
  const pct = `${String(ingotPercent(input.progressGold, input.ingotSize))}%`;
  const n = input.visitsToNext;
  if (input.approvedVisits < RELIABLE_ESTIMATE_VISITS || n === null || !(n >= 1)) return pct;
  return `${pct} · ${String(n)} more ${n === 1 ? "visit" : "visits"}`;
}

/** "Good morning" before 12:00, "Good afternoon" before 18:00, else "Good evening" (London time). */
export function greeting(now: Date, firstName: string | null): string {
  const hour = new Date(londonWall(now.getTime())).getUTCHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return firstName ? `${part}, ${firstName}` : part;
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
  versions: readonly ProgrammeVersion[];
  hours: readonly HoursRow[];
  closures: readonly ClosureRow[];
  /** Gold of the most recent approved awards, oldest first (P1-12 ledger; empty until then, C-62). */
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
  label: string;
  ingotsCompleted: number;
  /** Opening status for live shops with hours; null otherwise. */
  open: { tone: "open" | "closed"; text: string } | null;
} & WalletSortKey;

export function walletCard(input: WalletCardInput, now: Date): WalletCard {
  // The membership's current ingot started when it joined until P1-12 stores ingot_started_at (C-60).
  const state = {
    ...initialMemberState(input.joinedAt),
    progress: points(input.progressGold),
    ingotsCompleted: input.ingotsCompleted,
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
    ingotsCompleted: input.ingotsCompleted,
    open,
    purchaseCount: input.purchaseCount,
    lastVisitAt: input.lastVisitAt,
  };
}

export type WalletView = {
  cards: WalletCard[];
  summary: { rewardsReady: number; ingotsCompleted: number };
};

/** Cards in Wallet order plus the summary strip (rewards ready from P1-12/P1-16, C-62). */
export function walletView(
  inputs: readonly WalletCardInput[],
  rewardsReady: number,
  now: Date,
): WalletView {
  const cards = sortWallet(inputs.map((i) => walletCard(i, now)));
  return {
    cards,
    summary: {
      rewardsReady,
      ingotsCompleted: cards.reduce((sum, c) => sum + c.ingotsCompleted, 0),
    },
  };
}

/** "1 ingot filled" / "3 ingots filled". */
export const ingotsText = (n: number): string =>
  `${n.toLocaleString("en-GB")} ${n === 1 ? "ingot" : "ingots"} filled`;

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
