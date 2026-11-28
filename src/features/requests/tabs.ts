/**
 * The Requests page's tabs and page cursor (P2-02, PRODUCT §14): Pending / Awaiting owner / Approved today /
 * Expired. Both arrive in the URL (`?tab=…&before=…`), so they are parsed as untrusted text: anything unknown
 * falls back to the first page of the Pending tab, never an error.
 */

export const REQUEST_TABS = ["pending", "awaiting", "approved", "expired"] as const;
export type RequestTab = (typeof REQUEST_TABS)[number];

export const TAB_LABELS: Readonly<Record<RequestTab, string>> = {
  pending: "Pending",
  awaiting: "Awaiting owner",
  approved: "Approved today",
  expired: "Expired",
};

/** Rows per page on every tab. */
export const REQUESTS_PAGE_SIZE = 25;

export function parseTab(value: string | string[] | undefined): RequestTab {
  const v = Array.isArray(value) ? value[0] : value;
  return (REQUEST_TABS as readonly string[]).includes(v ?? "") ? (v as RequestTab) : "pending";
}

/**
 * Keyset cursor: the last row's sort time exactly as Postgres printed it (microseconds kept, so no row is
 * skipped or repeated between pages) and its id, base64url encoded.
 */
export type PageCursor = { at: string; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** `2026-11-28 09:14:05.123456+00` (timestamptz::text; any session zone offset). */
const PG_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2}){0,2}$/;
const CURSOR_MAX = 128;

export const encodeCursor = (c: PageCursor): string =>
  Buffer.from(`${c.at}|${c.id}`, "utf8").toString("base64url");

export function decodeCursor(value: string | string[] | undefined): PageCursor | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || v.length > CURSOR_MAX || !/^[A-Za-z0-9_-]+$/.test(v)) return null;
  const [at, id, ...rest] = Buffer.from(v, "base64url").toString("utf8").split("|");
  if (rest.length > 0 || at === undefined || id === undefined) return null;
  return PG_TIME.test(at) && UUID.test(id) ? { at, id } : null;
}
