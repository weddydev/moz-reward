import type { MemberId } from "@/lib/brand";
import { formatMemberId } from "@/lib/codes";
import { formatDate, formatDateTime, formatTime, londonDay } from "@/lib/format-date";
import { type EarnMode, versionActiveAt, type VersionDates } from "@/lib/loyalty/programme";
import { formatPence } from "@/lib/money";
import { AMOUNT_PENCE_MAX, REQUEST_ITEMS, REQUEST_TTL_MS, type RejectReason } from "@/lib/requests";
import type { TeamRequest, TeamRequestRow } from "@/server/repos/point-requests";

/**
 * The team's Requests queue as the page shows it (P1-12, minimal approve UI; the full page is P2). Built on the
 * server from `listTeamOpenRequests`, so the client gets plain strings and flags, never a profile row.
 */
export type QueueRow = {
  id: string;
  status: TeamRequestRow["status"];
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

/** A Requests-page row (P2-02): the queue row plus the approve panel's preview inputs and a decided outcome. */
export type BoardRow = QueueRow & {
  source: TeamRequestRow["source"];
  streak: TeamRequestRow["streak"];
  /** Approved: `+40 gold at 09:00`; expired: `Expired`; open rows: null. */
  outcome: string | null;
};

export const NO_CARD_NAME = "Member";

export const REJECT_REASON_LABELS: Readonly<Record<RejectReason, string>> = {
  no_purchase: "No purchase made",
  not_recognised: "We don't recognise this visit",
  already_awarded: "Already awarded for this visit",
  wrong_shop: "Made at a different shop",
  other: "Another reason",
};

export { formatPence };

const visitsText = (n: number): string =>
  n === 0 ? "First visit" : n === 1 ? "1 visit" : `${n.toLocaleString("en-GB")} visits`;

function proposalOf(
  r: Pick<TeamRequest, "items" | "amountPence" | "awardGold"> & {
    status: QueueRow["status"];
  },
): QueueRow["proposal"] {
  if (r.status !== "awaiting_owner") return null;
  const items = r.items ?? [];
  const parts = [
    r.amountPence === null ? null : formatPence(r.amountPence),
    items.length > 0 ? items.join(", ") : null,
    r.awardGold === null ? null : `+${r.awardGold.toLocaleString("en-GB")} gold`,
  ].filter((p): p is string => p !== null);
  return { amountPence: r.amountPence, items, gold: r.awardGold, text: parts.join(" · ") };
}

const isLive = (requestedAt: Date, now: Date): boolean =>
  now.getTime() - requestedAt.getTime() < REQUEST_TTL_MS;

type RowContext = {
  versions: readonly (VersionDates & { earnMode: EarnMode })[];
  role: "owner" | "staff";
  now: Date;
};

function queueRow(
  r: Omit<TeamRequest, "status"> & { status: QueueRow["status"] },
  ctx: RowContext,
  today: string,
): QueueRow {
  const rules = versionActiveAt(ctx.versions, r.requestedAt);
  const proposal = proposalOf(r);
  const ownerOnly = r.status === "awaiting_owner";
  const open = r.status === "pending" || r.status === "awaiting_owner";
  // Past its 24 h the request can't be decided, even before the expiry job marks it (the server refuses too).
  const live = open && isLive(r.requestedAt, ctx.now);
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
    canDecide: live && (!ownerOnly || ctx.role === "owner"),
    waiting:
      live && ownerOnly && ctx.role !== "owner"
        ? `Waiting for the owner to approve${r.awardGold === null ? "" : ` +${r.awardGold.toLocaleString("en-GB")} gold`}`
        : null,
  };
}

export function queueRows(requests: readonly TeamRequest[], ctx: RowContext): QueueRow[] {
  const today = londonDay(ctx.now);
  return requests.map((r) => queueRow(r, ctx, today));
}

function outcomeOf(r: TeamRequestRow, now: Date, today: string): string | null {
  switch (r.status) {
    case "approved": {
      if (!r.decidedAt) return "Approved";
      const at =
        londonDay(r.decidedAt) === today ? formatTime(r.decidedAt) : formatDateTime(r.decidedAt);
      return r.awardGold === null
        ? `Approved at ${at}`
        : `+${r.awardGold.toLocaleString("en-GB")} gold at ${at}`;
    }
    case "expired":
      return "Expired";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    case "pending":
    case "awaiting_owner":
      return isLive(r.requestedAt, now) ? null : "Expired";
    default: {
      const never: never = r.status;
      return String(never);
    }
  }
}

/** Rows for the Requests page's tabs (P2-02), built on the server like `queueRows`. */
export function boardRows(rows: readonly TeamRequestRow[], ctx: RowContext): BoardRow[] {
  const today = londonDay(ctx.now);
  return rows.map((r) => ({
    ...queueRow(r, ctx, today),
    source: r.source,
    streak: r.streak,
    outcome: outcomeOf(r, ctx.now, today),
  }));
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
