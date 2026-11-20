import type { VaultView } from "@/features/vault/view";
import { vaultGoldText } from "@/features/vault/view";
import { formatDate } from "@/lib/format-date";
import { addLondonDays } from "@/lib/time";

/**
 * Pure view helpers for the customer shop page (P1-09, DESIGN §15 screen 4; copy per DESIGN §14: UK English,
 * `7 Nov 2026`).
 */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Days a left membership's progress is kept for a rejoin (PRODUCT §4; P1-13 forfeits it after this). */
export const RESTORE_DAYS = 30;

/** The Gold Vault card: how full the current ingot is and the next reward on the way. */
export function vaultCardText(view: Pick<VaultView, "ingot" | "steps">): {
  percent: number;
  gold: string;
  next: string;
} {
  const next = view.steps.find((s) => !s.reached);
  const main = view.steps.find((s) => s.main);
  return {
    percent: view.ingot.percent,
    gold: vaultGoldText(view.ingot),
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
