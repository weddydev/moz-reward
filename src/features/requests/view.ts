import type { MemberId } from "@/lib/brand";
import { formatMemberId } from "@/lib/codes";
import { formatDate, formatDateTime, formatTime, londonDay } from "@/lib/format-date";
import { type EarnMode, versionActiveAt, type VersionDates } from "@/lib/loyalty/programme";
import { AMOUNT_PENCE_MAX, REQUEST_ITEMS, type RejectReason } from "@/lib/requests";
import type { TeamRequest } from "@/server/repos/point-requests";

/**
 * The team's Requests queue as the page shows it (P1-12, minimal approve UI; the full page is P2). Built on the
 * server from `listTeamOpenRequests`, so the client gets plain strings and flags, never a profile row.
 */
export type QueueRow = {
  id: string;
  status: TeamRequest["status"];
  name: string;
  memberId: string | null;
  /** `14:05` today (London), else `25 Nov 2026, 21:00` (a request lives 24 h). */
  requestedAt: string;
  requestedIso: string;
  visits: string;
  lastVisit: string | null;
  /** The rules active when the member asked give gold per £1, so the amount spent is required. */
  amountRequired: boolean;
  /** A staff member's over-limit approval sent to the owner: what they proposed. */
  proposal: {
    amountPence: number | null;
    items: string[];
    gold: number | null;
    text: string;
  } | null;
  /** Staff decide pending requests; an award waiting for the owner is the owner's alone. */
  canDecide: boolean;
  waiting: string | null;
};

export const NO_CARD_NAME = "Member";

export const REJECT_REASON_LABELS: Readonly<Record<RejectReason, string>> = {
  no_purchase: "No purchase made",
  not_recognised: "We don't recognise this visit",
  already_awarded: "Already awarded for this visit",
  wrong_shop: "Made at a different shop",
  other: "Another reason",
};

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
export const formatPence = (p: number): string => gbp.format(p / 100);

const visitsText = (n: number): string =>
  n === 0 ? "First visit" : n === 1 ? "1 visit" : `${n.toLocaleString("en-GB")} visits`;

function proposalOf(r: TeamRequest): QueueRow["proposal"] {
  if (r.status !== "awaiting_owner") return null;
  const items = r.items ?? [];
  const parts = [
    r.amountPence === null ? null : formatPence(r.amountPence),
    items.length > 0 ? items.join(", ") : null,
    r.awardGold === null ? null : `+${r.awardGold.toLocaleString("en-GB")} gold`,
  ].filter((p): p is string => p !== null);
  return { amountPence: r.amountPence, items, gold: r.awardGold, text: parts.join(" · ") };
}

export function queueRows(
  requests: readonly TeamRequest[],
  ctx: {
    versions: readonly (VersionDates & { earnMode: EarnMode })[];
    role: "owner" | "staff";
    now: Date;
  },
): QueueRow[] {
  const today = londonDay(ctx.now);
  return requests.map((r) => {
    const rules = versionActiveAt(ctx.versions, r.requestedAt);
    const proposal = proposalOf(r);
    const ownerOnly = r.status === "awaiting_owner";
    return {
      id: r.id,
      status: r.status,
      name: r.member?.name ?? NO_CARD_NAME,
      memberId: r.member ? formatMemberId(r.member.memberId as MemberId) : null,
      requestedAt:
        londonDay(r.requestedAt) === today
          ? formatTime(r.requestedAt)
          : formatDateTime(r.requestedAt),
      requestedIso: r.requestedAt.toISOString(),
      visits: visitsText(r.purchaseCount),
      lastVisit: r.lastVisitAt === null ? null : `Last visit ${formatDate(r.lastVisitAt)}`,
      amountRequired: rules?.earnMode === "per_pound",
      proposal,
      canDecide: !ownerOnly || ctx.role === "owner",
      waiting:
        ownerOnly && ctx.role !== "owner"
          ? `Waiting for the owner to approve${r.awardGold === null ? "" : ` +${r.awardGold.toLocaleString("en-GB")} gold`}`
          : null,
    };
  });
}

type Parsed<T> = { ok: true } & T;
type Refused = { ok: false; message: string };

const POUNDS = /^\d{1,7}(\.\d{1,2})?$/;

/** The amount spent as typed (`12.50`, `£8`): pence, null when left empty, or why it can't be used. */
export function parsePounds(text: string): Parsed<{ pence: number | null }> | Refused {
  const t = text.trim().replace(/^£\s*/, "");
  if (text.trim() === "") return { ok: true, pence: null };
  if (!POUNDS.test(t)) return { ok: false, message: "Enter the amount in pounds, like 12.50." };
  const [whole = "0", frac = ""] = t.split(".");
  const pence = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (pence <= 0) return { ok: false, message: "Enter an amount above £0." };
  if (pence > AMOUNT_PENCE_MAX) {
    return { ok: false, message: `Enter an amount up to ${formatPence(AMOUNT_PENCE_MAX)}.` };
  }
  return { ok: true, pence };
}

/** Items as typed, comma separated (optional): the request's own limits, checked again by the server. */
export function parseItems(text: string): Parsed<{ items: string[] }> | Refused {
  const items = text
    .split(",")
    .map((i) => i.trim())
    .filter((i) => i.length > 0);
  if (items.length > REQUEST_ITEMS.max) {
    return { ok: false, message: `List up to ${String(REQUEST_ITEMS.max)} items.` };
  }
  if (items.some((i) => i.length > REQUEST_ITEMS.maxLength)) {
    return {
      ok: false,
      message: `Keep each item to ${String(REQUEST_ITEMS.maxLength)} characters.`,
    };
  }
  return { ok: true, items };
}
