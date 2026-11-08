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
  if (!Number.isInteger(length) || length < 4 || length > 32)
    throw new RangeError("code length must be an integer between 4 and 32");
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
  return out;
}

/** Display format: groups of `group` characters joined by `separator` ("K7Q42MXA", 4 → "K7Q4-2MXA"). */
export function formatCode(code: string, opts: { group: number; separator?: string }): string {
  if (!Number.isInteger(opts.group) || opts.group < 1)
    throw new RangeError("group must be a positive integer");
  const parts: string[] = [];
  for (let i = 0; i < code.length; i += opts.group) parts.push(code.slice(i, i + opts.group));
  return parts.join(opts.separator ?? "-");
}

/** "K7Q42M" → "K7Q-42M" (display only; stored without the dash). */
export function formatMemberId(code: string): string {
  return formatCode(code, { group: 3 });
}

function isUniqueViolation(err: unknown): boolean {
  const code = (e: unknown): unknown =>
    typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  if (code(err) === "23505") return true;
  const cause =
    typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  return code(cause) === "23505";
}

/**
 * Runs `insert(code)` with fresh codes until it succeeds, retrying only on unique violations (23505),
 * at most 5 times. The DB unique constraint is the source of truth, not a read-before-write.
 */
export async function withUniqueCode<T>(
  insert: (code: string) => Promise<T>,
  opts: { length: number },
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await insert(generateCode(opts.length));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new CodeCollisionError(MAX_ATTEMPTS);
}
