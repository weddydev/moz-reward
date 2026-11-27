/**
 * Marketing consent wording (PECR, COMPLIANCE §3; P1-04). The version is stored with every consent row, and
 * the server stores a hash of the exact text it rendered (shop name included), never text from the client.
 * Changing the wording means a new version: the server then refuses an answer given to the old one, and the
 * customer sees the new text before answering again. Shared by the join sheet and the server; no zod (client).
 */
export const MARKETING_CONSENT_VERSION = "2026-11-17";

/**
 * The question and its details, shown as the checkbox label and the description under it (P1-A DES-M3).
 * Together they are exactly the stored, hashed text (`marketingConsentText`), so the split changes no version.
 */
export function marketingConsentParts(shopName: string): { question: string; details: string } {
  return {
    question: `Get offers and news from ${shopName}?`,
    details:
      "We'll send them in the app only, never by email. You can change this any time in the shop's settings.",
  };
}

export function marketingConsentText(shopName: string): string {
  const { question, details } = marketingConsentParts(shopName);
  return `${question} ${details}`;
}
