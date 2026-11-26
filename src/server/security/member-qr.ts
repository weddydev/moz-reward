import "server-only";
import { createCipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { MemberId } from "@/lib/brand";
import { MEMBER_ID_LENGTH, normaliseMemberId } from "@/lib/codes";
import { env } from "@/server/env";

/**
 * The member QR token (P1-14; SECURITY §6, "Member QR"; security design check 26 Nov). Short-lived, shop-agnostic,
 * and opaque: the member ID is encrypted, so the QR never carries it raw and two tokens of one member can't be
 * linked. Encrypt-then-MAC:
 *
 *   token = "MQ1." + base64url( ver 1 | exp u32 BE (unix s) | nonce 16 | AES-256-CTR(enc, nonce, member ID 6) | tag 16 )
 *   tag   = HMAC-SHA256(mac, "MQ1." + ver | exp | nonce | ct)[0..16]
 *
 * `enc` and `mac` are separate HKDF-SHA256 subkeys of MEMBER_QR_SIGNING_KEY (the master is never used directly).
 * AES-CTR with a 128-bit random IV rather than GCM: GCM's 96-bit random nonce caps a key at ~2^32 tokens.
 * Verify parses strictly, checks the tag in constant time BEFORE decrypting, then the expiry (and refuses an
 * expiry further out than one lifetime plus 30 s of clock skew), then the member ID's format. Not single-use: a
 * staff retry after a network error must work; the award (P2) has its own idempotency key and award guards.
 * Rotating MEMBER_QR_SIGNING_KEY invalidates live tokens (at most 5 minutes of codes; the cards refetch).
 */

export const MEMBER_QR_LIFETIME_MS = 5 * 60_000;
const MAX_SKEW_MS = 30_000;
const PREFIX = "MQ1.";
const VERSION = 1;
const NONCE = 16;
const TAG = 16;
const HEAD = 1 + 4 + NONCE;
const BYTES = HEAD + MEMBER_ID_LENGTH + TAG;
/** Characters in a token: prefix + base64url of 43 bytes, unpadded. */
export const MEMBER_QR_TOKEN_LENGTH = PREFIX.length + Math.ceil((BYTES * 4) / 3);
const SHAPE = new RegExp(`^MQ1\\.[A-Za-z0-9_-]{${MEMBER_QR_TOKEN_LENGTH - PREFIX.length}}$`);

export type MemberQrKeys = { enc: Buffer; mac: Buffer };
export type MemberQrCheck =
  | { ok: true; memberId: MemberId; expiresAt: number }
  | { ok: false; reason: "invalid" | "expired" };

const SALT = "moz-rewards/v1";

export function deriveMemberQrKeys(masterBase64: string): MemberQrKeys {
  const master = Buffer.from(masterBase64, "base64");
  const sub = (info: string): Buffer => Buffer.from(hkdfSync("sha256", master, SALT, info, 32));
  return { enc: sub("moz:member-qr:enc:v1"), mac: sub("moz:member-qr:mac:v1") };
}

let cached: MemberQrKeys | null = null;
/** The process's QR keys (derived once from MEMBER_QR_SIGNING_KEY). */
export function memberQrKeys(): MemberQrKeys {
  cached ??= deriveMemberQrKeys(env().MEMBER_QR_SIGNING_KEY);
  return cached;
}

const ctr = (key: Buffer, nonce: Buffer, data: Buffer): Buffer => {
  const c = createCipheriv("aes-256-ctr", key, nonce);
  return Buffer.concat([c.update(data), c.final()]);
};

const tagOf = (key: Buffer, signed: Buffer): Buffer =>
  createHmac("sha256", key)
    .update(Buffer.from(PREFIX, "ascii"))
    .update(signed)
    .digest()
    .subarray(0, TAG);

/** A fresh token for `memberId`, valid for 5 minutes from `nowMs` (server clock). `opts.version` is for tests. */
export function signMemberQr(
  memberId: MemberId,
  nowMs: number,
  keys: MemberQrKeys,
  opts: { version?: number } = {},
): { token: string; expiresAt: number } {
  const exp = Math.floor(nowMs / 1000) + MEMBER_QR_LIFETIME_MS / 1000;
  const head = Buffer.alloc(HEAD);
  head.writeUInt8(opts.version ?? VERSION, 0);
  head.writeUInt32BE(exp, 1);
  const nonce = randomBytes(NONCE);
  nonce.copy(head, 5);
  const signed = Buffer.concat([head, ctr(keys.enc, nonce, Buffer.from(memberId, "ascii"))]);
  const bytes = Buffer.concat([signed, tagOf(keys.mac, signed)]);
  return { token: PREFIX + bytes.toString("base64url"), expiresAt: exp * 1000 };
}

export function verifyMemberQr(token: string, nowMs: number, keys: MemberQrKeys): MemberQrCheck {
  const invalid = { ok: false, reason: "invalid" } as const;
  if (typeof token !== "string" || !SHAPE.test(token)) return invalid;
  const bytes = Buffer.from(token.slice(PREFIX.length), "base64url");
  // Re-encoding must give the same text: no non-canonical trailing bits.
  if (bytes.length !== BYTES || PREFIX + bytes.toString("base64url") !== token) return invalid;
  const signed = bytes.subarray(0, BYTES - TAG);
  if (!timingSafeEqual(bytes.subarray(BYTES - TAG), tagOf(keys.mac, signed))) return invalid;
  if (signed.readUInt8(0) !== VERSION) return invalid;
  const expiresAt = signed.readUInt32BE(1) * 1000;
  if (expiresAt > nowMs + MEMBER_QR_LIFETIME_MS + MAX_SKEW_MS) return invalid;
  if (nowMs >= expiresAt) return { ok: false, reason: "expired" };
  const plain = ctr(keys.enc, signed.subarray(5, HEAD), signed.subarray(HEAD)).toString("latin1");
  const memberId = normaliseMemberId(plain);
  if (!memberId || memberId !== plain) return invalid;
  return { ok: true, memberId, expiresAt };
}
