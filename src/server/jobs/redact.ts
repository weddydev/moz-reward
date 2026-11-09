import "server-only";

/**
 * Redaction for the dead-letter table and worker logs (P0-04, SECURITY §7: no personal data or secrets in
 * logs). Allowlist, not denylist: a string value survives only when its key is a known id/enum key *and* the
 * value looks like an id or enum (no spaces, no `@`, at most 64 chars). Every other string is replaced, so a
 * phone number under `to` or a name under `recipient` can't leak. Numbers, booleans and null are kept, as is
 * the payload's shape. Over-redacting is the safe direction.
 *
 * Payloads should carry ids only (enforced for the registry in registry.test.ts); BullMQ keeps the raw
 * `job.data` in Redis for a week, so this is a second line of defence, not the first.
 */
const SAFE_KEY = /^(id|[a-z]+Id|[a-z]+Ids|kind|type|status|attempt|version|reason)$/;
/** Id-shaped keys that still identify a person or grant access. */
const NEVER_SAFE_KEY = /(member|session|token|device|push|code|external|email|phone)/i;
const ID_VALUE = /^[A-Za-z0-9._:-]{1,64}$/;

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const BEARER = /\b(Bearer)\s+[^\s)]+/gi;
const QUERY_VALUE = /([?&][^=\s&#]+=)[^&\s#)]+/g;
/** Digit runs with separators (`+44 7700 900123`, `(020) 7946 0958`); 10+ digits = a phone number, not a date. */
const SEPARATED_DIGITS = /\+?\(?\d[\d\s().-]{7,}\d/g;
const LONG_DIGITS = /\d{7,}/g;
const MAX_DEPTH = 5;
const MAX_ITEMS = 50;
const MAX_STRING = 200;

export const REDACTED = "[redacted]";

export function redactText(text: string): string {
  const scrubbed = text
    .replace(EMAIL, REDACTED)
    .replace(BEARER, `$1 ${REDACTED}`)
    .replace(QUERY_VALUE, `$1${REDACTED}`)
    .replace(SEPARATED_DIGITS, (run) => ((run.match(/\d/g)?.length ?? 0) >= 10 ? REDACTED : run))
    .replace(LONG_DIGITS, REDACTED);
  return scrubbed.length > MAX_STRING ? `${scrubbed.slice(0, MAX_STRING)}…` : scrubbed;
}

/** Keys whose string values may be kept (id/enum keys that do not identify a person). */
export const isSafeKey = (key: string): boolean => SAFE_KEY.test(key) && !NEVER_SAFE_KEY.test(key);

/** `stringsAllowed`: the value sits under a safe key (or in an array under one). */
export function redact(value: unknown, depth = 0, stringsAllowed = false): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (typeof value === "string") return stringsAllowed && ID_VALUE.test(value) ? value : REDACTED;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => redact(v, depth + 1, stringsAllowed));
    return value.length > MAX_ITEMS
      ? [...items, `[+${String(value.length - MAX_ITEMS)} more]`]
      : items;
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = redact(v, depth + 1, isSafeKey(key));
  }
  return out;
}
