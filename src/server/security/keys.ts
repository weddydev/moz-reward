import "server-only";
import { hkdfSync } from "node:crypto";
import { env } from "@/server/env";

/**
 * One key per purpose for keyed hashes of personal data (SECURITY §7, L10), derived with HKDF-SHA256 from
 * BLIND_INDEX_KEY. AUTH_SECRET is Better Auth's alone: rotating it never changes stored hashes, and a hash
 * made for one purpose can't be replayed as another. The phone blind index (P1-04) uses `purposeKey("blind-index")`,
 * never the master key itself (SECURITY §7, DECISIONS 10 Nov).
 */
export const PURPOSES = ["email-key", "ip-hash", "blind-index"] as const;
export type Purpose = (typeof PURPOSES)[number];

const SALT = "moz-rewards/v1";

export function derivePurposeKey(masterBase64: string, purpose: Purpose): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(masterBase64, "base64"), SALT, purpose, 32));
}

const cache = new Map<Purpose, Buffer>();

/** The process's key for `purpose` (derived once). */
export function purposeKey(purpose: Purpose): Buffer {
  let key = cache.get(purpose);
  if (!key) {
    key = derivePurposeKey(env().BLIND_INDEX_KEY, purpose);
    cache.set(purpose, key);
  }
  return key;
}
