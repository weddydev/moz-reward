/** Up to two initials (first and last word), for avatar and logo fallbacks. Pure: server and client. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return "";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  const letter = (w: string) => (Array.from(w)[0] ?? "").toLocaleUpperCase("en-GB");
  return letter(first) + (last ? letter(last) : "");
}

/** Most letters a receipt's staff initials carry (DECISIONS 26 Nov: kept after the staff member's erasure). */
export const RECEIPT_INITIALS_MAX = 3;

/**
 * A receipt's staff initials (PRODUCT §11): the first letter of each word, upper case, at most 3
 * ("Mary-Jane O'Neil Smith" → "MOS"). Letters only, any script; empty when the name has none.
 */
export function receiptInitials(name: string): string {
  const letters: string[] = [];
  for (const word of name.normalize("NFC").split(/\s+/u)) {
    const first = /\p{L}/u.exec(word)?.[0];
    if (first) letters.push(first.toLocaleUpperCase("en-GB"));
    if (letters.length === RECEIPT_INITIALS_MAX) break;
  }
  return letters.join("");
}
