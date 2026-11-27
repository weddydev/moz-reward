import type { VaultView } from "@/features/vault/view";
import { type CelebrationReceipt, receiptView, type ReceiptSnapshot } from "@/lib/celebration";
import { formatDate, formatTime } from "@/lib/format-date";
import { addLondonDays } from "@/lib/time";

/**
 * Pure view helpers for the customer shop page (P1-09, DESIGN §15 screen 4; copy per DESIGN §14: UK English,
 * `7 Nov 2026`).
 */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Days a left membership's progress is kept for a rejoin (PRODUCT §4; P1-13 forfeits it after this). */
export const RESTORE_DAYS = 30;

/**
 * The Gold Vault card: how full the current ingot is and the next reward on the way (the gold itself is on the
 * mini vault line above it, PD-11).
 */
export function vaultCardText(view: Pick<VaultView, "ingot" | "steps">): {
  percent: number;
  next: string;
} {
  const next = view.steps.find((s) => !s.reached);
  const main = view.steps.find((s) => s.main);
  return {
    percent: view.ingot.percent,
    next: next
      ? `Next: ${next.title} at ${String(next.percent)}%`
      : `Ingot full: ${main?.title ?? "your reward"} is ready`,
  };
}

/** "Today", or `Thu 20 Nov 2026` for a London calendar date (YYYY-MM-DD). */
export function closureLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const noon = new Date(`${date}T12:00:00Z`);
  return `${WEEKDAYS[noon.getUTCDay()] ?? ""} ${formatDate(noon)}`;
}

/** Special closures from today on (the landing data window holds yesterday plus the next week), date order. */
export function upcomingClosures(
  closures: readonly { date: string; note: string | null }[],
  today: string,
): { date: string; label: string; note: string | null }[] {
  return closures
    .filter((c) => c.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => ({ date: c.date, label: closureLabel(c.date, today), note: c.note }));
}

/** The last day a rejoin restores the frozen progress, if the member leaves at `now` (`19 Dec 2026`). */
export const leaveRestoreBy = (now: Date): string => formatDate(addLondonDays(now, RESTORE_DAYS));

/**
 * The pending state's copy (P1-11): when the request reached us (UK time) and who it waits for. A request goes
 * to the owner when the award is above the staff member's limit (P1-12); either way it expires after 24 h.
 */
export function pendingRequestText(
  open: { status: "pending" | "awaiting_owner"; requestedAt: string },
  shopName: string,
): { title: string; body: string; expiry: string } {
  const at = formatTime(new Date(open.requestedAt));
  return open.status === "awaiting_owner"
    ? {
        title: "Waiting for the owner",
        body: `Sent at ${at}. It needs the owner of ${shopName} to approve it.`,
        expiry: "If it isn’t approved within 24 hours, it expires and you can ask again.",
      }
    : {
        title: "Request sent",
        body: `Sent at ${at}. Staff at ${shopName} will approve it shortly.`,
        expiry: "If it isn’t approved within 24 hours, it expires and you can ask again.",
      };
}

/** One row of the shop page's Recent receipts card (P1-12, C-69). */
export type ReceiptRow = {
  id: string;
  /** "Receipt 12". */
  title: string;
  /** "26 Nov 2026, 14:05" (UK time). */
  when: string;
  /** "+120 gold": the visit's gold with any streak bonus. */
  gold: string;
  /** "Flat white, Croissant", or null when staff added no items. */
  items: string | null;
  /** The PDF download (the customer route; the file is rendered by the worker). */
  pdfHref: string;
  /** P1-15: the receipt as its card shows it (opening a row prints it). */
  receipt: CelebrationReceipt;
};

export function receiptRow(receipt: {
  id: string;
  number: number;
  createdAt: Date;
  data: ReceiptSnapshot;
}): ReceiptRow {
  const gold = receipt.data.goldEarned + receipt.data.bonusGold;
  return {
    id: receipt.id,
    title: `Receipt ${receipt.number.toLocaleString("en-GB")}`,
    when: `${formatDate(receipt.createdAt)}, ${formatTime(receipt.createdAt)}`,
    gold: `+${gold.toLocaleString("en-GB")} gold`,
    items: receipt.data.items.length > 0 ? receipt.data.items.join(", ") : null,
    pdfHref: `/api/me/receipts/${encodeURIComponent(receipt.id)}/pdf`,
    receipt: receiptView(receipt),
  };
}
