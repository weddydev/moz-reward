import "server-only";
import { env } from "@/server/env";
import { phoneBlindIndexWith } from "@/server/services/phone";
import { type Keyring, parseKeyring } from "./field-crypto";
import { purposeKey } from "./keys";

let ring: Keyring | undefined;

/** The process's field-encryption keyring (current key + decrypt-only old keys), built once from the env. */
export function fieldKeyring(): Keyring {
  ring ??= parseKeyring({ key: env().DATA_ENCRYPTION_KEY, old: env().DATA_ENCRYPTION_OLD_KEYS });
  return ring;
}

/** Tests only: use `next` as the process keyring (rotation tests); `undefined` goes back to the env's. */
export function setFieldKeyringForTests(next: Keyring | undefined): void {
  ring = next;
}

/** Blind index of an E.164 phone number: HMAC with the "blind-index" purpose key (SECURITY §7, P0-19). */
export function phoneBlindIndex(e164: string): string {
  return phoneBlindIndexWith(purposeKey("blind-index"), e164);
}

/** AAD context of a customer's phone (field-crypto: binds the value to its row). */
export const profilePhoneContext = (userId: string): string => `customer_profiles.phone|${userId}`;
