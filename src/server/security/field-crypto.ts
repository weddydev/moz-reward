import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Field-level encryption (SECURITY §7, P1-04): AES-256-GCM with a random 96-bit IV per write. Each value is
 * stored with the id of the key that sealed it, so a rotation only adds a key: new writes use the current
 * key, old values still open with theirs, and the re-encryption job (`src/server/jobs/reencrypt.ts`) moves
 * them over. The additional authenticated data binds a value to its place and key id
 * (`"<table>.<column>|<row id>|<key id>"`), so ciphertext copied to another row or relabelled with another
 * key id fails the tag instead of decrypting.
 *
 * The key id is derived from the key itself (`keyIdOf`): an HMAC of a fixed label under the key, so the id
 * always travels with its key. A release rolled back across a rotation, or a key pasted into the wrong secret,
 * can never seal values under one key while labelling them with another (DECISIONS 17 Nov, P1-04 B).
 *
 * Pure: the keyring is passed in (`fieldKeyring()` in `field-keys.ts` builds it from the env). Errors name
 * the problem and the key id only, never the value, the key or the ciphertext.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID_LABEL = "moz-rewards/field-key-id/v1";
/** Format version of the stored value, so the algorithm can change later without guessing. */
const PREFIX = "v1.";

export type Keyring = {
  readonly current: string;
  /** Current first, then the old (decrypt-only) keys in the order given. */
  readonly ids: readonly string[];
  readonly keys: ReadonlyMap<string, Buffer>;
};

export type Sealed = { keyId: string; ciphertext: string };

export class FieldCryptoError extends Error {
  constructor(
    readonly kind: "unknown-key" | "integrity" | "malformed" | "keyring",
    message: string,
  ) {
    super(message);
    this.name = "FieldCryptoError";
  }
}

function decodeKey(b64: string, label: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32 || key.toString("base64") !== b64)
    throw new FieldCryptoError("keyring", `${label} must be base64 of exactly 32 bytes`);
  return key;
}

const idOf = (key: Buffer): string =>
  "k" + createHmac("sha256", key).update(KEY_ID_LABEL).digest("hex").slice(0, 10);

/** The id stored with every value a key seals: `k` + 10 hex characters, derived from the key (base64). */
export function keyIdOf(b64: string): string {
  return idOf(decodeKey(b64, "key"));
}

/**
 * Builds the keyring from `DATA_ENCRYPTION_KEY` and, during a rotation, the decrypt-only
 * `DATA_ENCRYPTION_OLD_KEYS` (base64 keys, comma-separated). Throws on a malformed key, an old key equal to the
 * current one or to another old key, or the retired `id:base64` format. Messages name positions and ids only.
 */
export function parseKeyring(spec: { key: string; old?: string | undefined }): Keyring {
  const current = decodeKey(spec.key, "DATA_ENCRYPTION_KEY");
  const keys = new Map<string, Buffer>([[idOf(current), current]]);
  const items = (spec.old ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  items.forEach((item, i) => {
    const label = `old key ${String(i + 1)}`;
    if (item.includes(":"))
      throw new FieldCryptoError(
        "keyring",
        `${label}: list old keys as base64 only (the id is derived from the key)`,
      );
    const key = decodeKey(item, label);
    if (key.equals(current)) throw new FieldCryptoError("keyring", `${label} is the current key`);
    const id = idOf(key);
    if (keys.has(id)) throw new FieldCryptoError("keyring", `${label} repeats an earlier old key`);
    keys.set(id, key);
  });
  return { current: idOf(current), ids: [...keys.keys()], keys };
}

const aad = (context: string, keyId: string): Buffer => Buffer.from(`${context}|${keyId}`, "utf8");

/** Seals `plaintext` under the current key. `context` names the value's place: `"<table>.<column>|<row id>"`. */
export function sealField(ring: Keyring, plaintext: string, context: string): Sealed {
  const key = ring.keys.get(ring.current);
  if (!key) throw new FieldCryptoError("keyring", "the current key is missing from the keyring");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(context, ring.current));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    keyId: ring.current,
    ciphertext: PREFIX + Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64"),
  };
}

/** Opens a sealed value. Throws `FieldCryptoError` on an unknown key id, a failed tag or a malformed value. */
export function openField(ring: Keyring, sealed: Sealed, context: string): string {
  const key = ring.keys.get(sealed.keyId);
  if (!key) throw new FieldCryptoError("unknown-key", `unknown key id "${sealed.keyId}"`);
  if (!sealed.ciphertext.startsWith(PREFIX))
    throw new FieldCryptoError("malformed", "malformed ciphertext");
  const bytes = Buffer.from(sealed.ciphertext.slice(PREFIX.length), "base64");
  if (bytes.length < IV_BYTES + TAG_BYTES + 1)
    throw new FieldCryptoError("malformed", "malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, IV_BYTES), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(aad(context, sealed.keyId));
  decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
  try {
    return Buffer.concat([
      decipher.update(bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new FieldCryptoError("integrity", `integrity check failed (key id "${sealed.keyId}")`);
  }
}
