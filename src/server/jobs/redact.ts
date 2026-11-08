import "server-only";

/**
 * Redaction for the dead-letter table (P0-04, SECURITY §7: no personal data or secrets in logs). Keeps the
 * payload's shape and ids so a failure can be diagnosed, and drops anything that could identify a person or
 * grant access. Over-redacting is the safe direction.
 */
const SENSITIVE_KEY =
  /(e-?mail|phone|mobile|token|secret|password|passcode|otp|code|key|address|postcode|name|ip|note|body|message|text|content|card|iban|dob|birth)/i;
const SAFE_KEY = /^(id|[a-z]+Id|[a-z]+Ids|kind|type|status|count|attempt|version)$/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const LONG_DIGITS = /\d{7,}/g;
const MAX_DEPTH = 5;
const MAX_ITEMS = 50;
const MAX_STRING = 200;

export const REDACTED = "[redacted]";

export function redactText(text: string): string {
  const scrubbed = text.replace(EMAIL, REDACTED).replace(LONG_DIGITS, REDACTED);
  return scrubbed.length > MAX_STRING ? `${scrubbed.slice(0, MAX_STRING)}…` : scrubbed;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => redact(v, depth + 1));
    return value.length > MAX_ITEMS
      ? [...items, `[+${String(value.length - MAX_ITEMS)} more]`]
      : items;
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = !SAFE_KEY.test(key) && SENSITIVE_KEY.test(key) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}
