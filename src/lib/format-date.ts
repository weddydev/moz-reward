/**
 * Customer-facing dates (CLAUDE.md §5): `7 Nov 2026`, 24-hour times, always UK time so server and browser
 * agree. Month names come from a fixed list because ICU versions differ ("Sep" vs "Sept").
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function londonParts(date: Date): Record<"year" | "month" | "day" | "hour" | "minute", string> {
  const out = { year: "", month: "", day: "", hour: "", minute: "" };
  for (const part of PARTS.formatToParts(date)) {
    if (part.type in out) out[part.type as keyof typeof out] = part.value;
  }
  return out;
}

export function formatDate(date: Date): string {
  const p = londonParts(date);
  return `${Number(p.day)} ${MONTHS[Number(p.month) - 1] ?? ""} ${p.year}`;
}

export function formatDateTime(date: Date): string {
  const p = londonParts(date);
  return `${formatDate(date)}, ${p.hour}:${p.minute}`;
}
