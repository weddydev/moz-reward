/**
 * Profile input rules shared by the join sheet and the server (P1-04, security design check L10). Pure and
 * zod-free so the client bundle can use them; the server action is the control, the sheet only mirrors it.
 */

export const UK_MOBILE_ONLY =
  "Please enter a UK mobile number, like 07400 123456. We can't take numbers from other countries yet.";
export const BIRTHDAY_INVALID = "Please choose a real day and month, or leave both empty.";
export const OVER_13_REQUIRED = "Please confirm you're 13 or over to join.";
export const TOO_MANY_NEW_SHOPS = "You've joined a lot of shops today. Please try again tomorrow.";

/** Same bound as the `customer_profiles_full_name_length` CHECK (characters, after cleaning). */
export const NAME_MAX = 80;

/**
 * Control characters (incl. newlines and tabs) and Unicode "format" characters: bidi overrides, isolates and
 * marks, zero-width spaces and joiners, the BOM, soft hyphens. They can make a name read differently on a staff
 * screen than it was stored (spoofing) or look empty, so a name containing any of them is refused, not
 * silently stripped: the customer sees exactly what is saved.
 */
const HIDDEN = /[\p{Cc}\p{Cf}]/u;
const LETTER = /\p{L}/u;

export type NameCheck = { ok: true; value: string } | { ok: false; message: string };

export function cleanPersonName(raw: string): NameCheck {
  const nfc = raw.normalize("NFC");
  if (HIDDEN.test(nfc))
    return { ok: false, message: "Your name contains a hidden character. Please type it again." };
  const value = nfc.trim().replace(/\s+/gu, " ");
  if (!LETTER.test(value)) return { ok: false, message: "Please enter your full name." };
  // Code points, as Postgres `char_length` counts them for the CHECK (not UTF-16 units, not graphemes).
  if (Array.from(value).length > NAME_MAX)
    return { ok: false, message: `Please keep your name to ${String(NAME_MAX)} characters.` };
  return { ok: true, value };
}

/** Days in each month of a leap year: a birthday has no year, so 29 February is allowed. */
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function validBirthday(day: number, month: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  const max = MONTH_DAYS[month - 1];
  return max !== undefined && day >= 1 && day <= max;
}
