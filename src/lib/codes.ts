import { randomInt } from "node:crypto";

/**
 * Public short codes (shop codes, member IDs, claim/redeem codes) — ARCHITECTURE §3, ENGINEERING §7.
 * Crockford base32 without the confusable 0, O, 1, I, L (and U): 30 characters.
 */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const MAX_ATTEMPTS = 5;

export class CodeCollisionError extends Error {
  constructor(attempts: number) {
    super(`Could not generate a unique code after ${attempts} attempts`);
    this.name = "CodeCollisionError";
  }
}

/** Crypto-random code of `length` characters (uniform: randomInt avoids modulo bias). */
export function generateCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** "K7Q42M" → "K7Q-42M" (display only; stored without the dash). */
export function formatMemberId(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

function isUniqueViolation(err: unknown): boolean {
  const code = (e: unknown): unknown => (typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined);
  if (code(err) === "23505") return true;
  const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  return code(cause) === "23505";
}

/**
 * Runs `insert(code)` with fresh codes until it succeeds, retrying only on unique violations (23505),
 * at most 5 times. The DB unique constraint is the source of truth, not a read-before-write.
 */
export async function withUniqueCode<T>(insert: (code: string) => Promise<T>, opts: { length: number }): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await insert(generateCode(opts.length));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new CodeCollisionError(MAX_ATTEMPTS);
}
