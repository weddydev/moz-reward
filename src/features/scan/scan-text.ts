import { normaliseMemberId } from "@/lib/codes";

/**
 * What a scanned QR says, before anything goes to the server (P2-02). Only text shaped like a member-QR token
 * (P1-14: `MQ1.` + 58 base64url characters) is sent to verify; the server checks the signature, the expiry and
 * the membership. A shop's own entry QR (`…/s/<code>`) gets its own hint, since staff will point the camera at
 * the counter sticker; anything else is "not a member QR" without being sent anywhere.
 */
export const MEMBER_QR_SHAPE = /^MQ1\.[A-Za-z0-9_-]{58}$/;
const SHOP_LINK = /^https?:\/\/[^/\s]+\/s\/[A-Za-z0-9-]{4,16}(?:[/?#]|$)/i;

export type ScanText = { kind: "member"; token: string } | { kind: "shop" } | { kind: "other" };

export function readScanText(raw: string): ScanText {
  const text = raw.trim();
  if (MEMBER_QR_SHAPE.test(text)) return { kind: "member", token: text };
  if (SHOP_LINK.test(text)) return { kind: "shop" };
  return { kind: "other" };
}

/** A member ID as typed from an offline card, ready to send (dash, spaces and case forgiven), or null. */
export const typedMemberId = (text: string): string | null => normaliseMemberId(text);

/** Text-input shape while typing a member ID: letters, digits, one optional dash, at most 7 characters. */
export const MEMBER_ID_TYPING = /^[A-Za-z0-9]{0,3}-?[A-Za-z0-9]{0,3}$/;
