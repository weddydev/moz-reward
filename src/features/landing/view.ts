import type { HoursRow, OpenStatus } from "@/lib/open-status";

/**
 * Pure view helpers for the shop landing page (P1-02, DESIGN §14 copy: UK English, 24h times, `7 Nov 2026`).
 */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** "24:00" and "00:00" as a closing time read as midnight. */
const time = (t: string, closing = false): string =>
  closing && (t === "24:00" || t === "00:00") ? "midnight" : t;

/** Status line next to the shop name. `today` is the London calendar date (YYYY-MM-DD). */
export function statusLabel(
  status: OpenStatus,
  today: string,
): { tone: "open" | "closed"; text: string } {
  switch (status.state) {
    case "open":
      return { tone: "open", text: `Open · closes ${time(status.closesAt, true)}` };
    case "closes_soon":
      return { tone: "open", text: `Closes soon · ${time(status.closesAt, true)}` };
    case "opens_at": {
      if (status.date === today)
        return { tone: "closed", text: `Closed · opens ${status.opensAt}` };
      const weekday = WEEKDAYS[(new Date(`${status.date}T12:00:00Z`).getUTCDay() + 6) % 7];
      return { tone: "closed", text: `Closed · opens ${weekday ?? ""} ${status.opensAt}` };
    }
    case "closed":
      return { tone: "closed", text: "Closed" };
  }
}

/** Monday-first opening times for the details card; days without hours read "Closed". */
export function weekRows(hours: readonly HoursRow[]): { day: string; times: string }[] {
  return WEEKDAY_NAMES.map((day, i) => {
    const windows = hours
      .filter((h) => h.weekday === i + 1)
      .sort((a, b) => a.opens.localeCompare(b.opens))
      .map((h) => `${h.opens}–${time(h.closes, true)}`);
    return { day, times: windows.length ? windows.join(", ") : "Closed" };
  });
}

const CATEGORY_LABELS: Record<string, string> = {
  cafe: "Café",
  "coffee-shop": "Coffee shop",
  restaurant: "Restaurant",
  takeaway: "Takeaway",
  bakery: "Bakery",
  barber: "Barber",
  salon: "Salon",
  "beauty-salon": "Beauty salon",
  pub: "Pub",
  bar: "Bar",
  grocer: "Grocer",
  retail: "Shop",
};

/** Display label for a stored category key ("cafe" → "Café"); unknown keys are tidied ("nail-bar" → "Nail bar"). */
export function categoryLabel(key: string): string {
  const known = CATEGORY_LABELS[key.toLowerCase()];
  if (known) return known;
  const words = key.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

/** "Café · Shoreditch", or just the category. */
export const areaLine = (category: string, town: string | null): string => {
  const label = categoryLabel(category);
  return town ? `${label} · ${town}` : label;
};

/** One-line postal address from the parts that are set. */
export function addressLine(parts: (string | null)[]): string | null {
  const set = parts.map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  return set.length ? set.join(", ") : null;
}

/** The London calendar date for `now` (YYYY-MM-DD). */
export const londonDate = (now: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
