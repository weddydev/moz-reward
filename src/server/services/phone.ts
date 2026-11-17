import "server-only";
import { createHmac } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * Customer phone numbers (PRODUCT §3, SECURITY §7, P1-04). UK mobiles only: the number must use the +44
 * country code and be a mobile by libphonenumber's full metadata (which also covers the Crown Dependencies'
 * 07 ranges, DECISIONS 17 Nov). Stored as E.164, sealed with `sealField`, and looked up by a blind index
 * (HMAC-SHA256 with the "blind-index" purpose key, never `BLIND_INDEX_KEY` itself). Server only: the full
 * metadata is far too big for the browser, which checks nothing beyond "required".
 */

/** Longest sensible way to write a UK mobile ("+44 (0)7400 123 456" is 20); checked before parsing. */
const MAX_INPUT = 20;

export type PhoneParse = { ok: true; e164: string } | { ok: false; reason: "not-uk-mobile" };

export function parseUkMobile(input: string): PhoneParse {
  const raw = input.trim();
  if (!raw || raw.length > MAX_INPUT) return { ok: false, reason: "not-uk-mobile" };
  // "+44 (0)7…" is a common way to write UK numbers; the (0) is the trunk prefix, not a digit.
  const parsed = parsePhoneNumberFromString(raw.replace(/\(0\)/g, ""), {
    defaultCountry: "GB",
    extract: false,
  });
  if (
    !parsed ||
    parsed.countryCallingCode !== "44" ||
    parsed.ext ||
    !parsed.isValid() ||
    parsed.getType() !== "MOBILE"
  )
    return { ok: false, reason: "not-uk-mobile" };
  return { ok: true, e164: parsed.number };
}

/** "+447400123456" → "07••• •••456": what staff see unless they choose to reveal (P2 CRM). */
export function maskPhone(e164: string): string {
  const national = e164.startsWith("+44") ? `0${e164.slice(3)}` : e164;
  return `${national.slice(0, 2)}••• •••${national.slice(-3)}`;
}

/** Hex HMAC-SHA256 of the E.164 number under `key` (the "blind-index" purpose key in production code). */
export function phoneBlindIndexWith(key: Buffer, e164: string): string {
  return createHmac("sha256", key).update(e164, "utf8").digest("hex");
}
