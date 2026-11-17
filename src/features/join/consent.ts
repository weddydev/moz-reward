/**
 * Marketing consent wording (PECR, COMPLIANCE §3; P1-04). The version is stored with every consent row, and
 * the server stores a hash of the exact text it rendered (shop name included), never text from the client.
 * Changing the wording means a new version: the server then refuses an answer given to the old one, and the
 * customer sees the new text before answering again. Shared by the join sheet and the server; no zod (client).
 */
export const MARKETING_CONSENT_VERSION = "2026-11-17";

export function marketingConsentText(shopName: string): string {
  return `Get offers and news from ${shopName}? We'll send them in the app only, never by email. You can change this any time in the shop's settings.`;
}
