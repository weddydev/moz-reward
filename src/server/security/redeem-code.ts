import "server-only";
import { createHmac } from "node:crypto";
import { generateCode, normaliseCode } from "@/lib/codes";
import { REDEEM } from "@/lib/loyalty/redeem";
import { purposeKey } from "./keys";

/**
 * Redeem codes (P1-16, SECURITY §6): 6 crypto-random characters of `CODE_ALPHABET`. Only an HMAC of shop + code
 * is stored (purpose `redeem-code`), so the table never holds a usable code (design check 27 Nov, MEDIUM 3).
 */
export const generateRedeemCode = (): string => generateCode(REDEEM.codeLength);

/** A typed code as generated, or null when it can't be one (wrong length or a character never emitted). */
export const normaliseRedeemCode = (input: string): string | null =>
  normaliseCode(input, REDEEM.codeLength);

export function redeemCodeHash(
  shopId: string,
  code: string,
  key = purposeKey("redeem-code"),
): string {
  return createHmac("sha256", key).update(`${shopId.toLowerCase()}|${code}`).digest("hex");
}
