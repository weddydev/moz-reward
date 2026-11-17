/**
 * UUIDs (request ids, row ids) are not personal data, but a random one can hold a long run of digits and look
 * like a phone or card number to a scrubber. `outsideUuids` applies `fn` only to the text between tokens shaped
 * exactly like a UUID (hex on both edges, so digits running on past one are still scrubbed). Used by the audit
 * and dead-letter redaction (P1-04); `src/lib/sentry-scrub.ts` keeps its own copy because it must stay
 * import-free (CI 42984090179).
 */
const UUID =
  /(?<![0-9a-f-])([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-f-])/i;

export function outsideUuids(text: string, fn: (part: string) => string): string {
  // The capturing group makes `split` keep the UUIDs, at odd indexes.
  return text
    .split(UUID)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}
