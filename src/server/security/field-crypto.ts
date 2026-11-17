import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Field-level encryption (SECURITY §7, P1-04): AES-256-GCM with a random 96-bit IV per write. Each value is
 * stored with the id of the key that sealed it, so a rotation only adds a key: new writes use the current
 * key, old values still open with theirs, and the re-encryption job (`src/server/jobs/reencrypt.ts`) moves
 * them over. The additional authenticated data binds a value to its place and key id
 * (`"<table>.<column>|<row id>|<key id>"`), so ciphertext copied to another row or relabelled with another
 * key id fails the tag instead of decrypting.
 *
 * Pure: the keyring is passed in (`fieldKeyring()` in `field-keys.ts` builds it from the env). Errors name
 * the problem and the key id only, never the value, the key or the ciphertext.
 */

/** Local/test key id when `DATA_ENCRYPTION_KEY_ID` is unset (required elsewhere, `parseServerEnv`). */
export const DEFAULT_DATA_KEY_ID = "k1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID = /^[a-z0-9-]{1,16}$/;
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

/**
 * Builds the keyring. `old` is the decrypt-only list kept during a rotation: `"k1:<base64>,k0:<base64>"`.
 * Throws on a malformed id, a duplicate id, or the same key under two ids.
 */
export function parseKeyring(spec: { key: string; id: string; old?: string | undefined }): Keyring {
  const entries: [string, Buffer][] = [[spec.id, decodeKey(spec.key, "DATA_ENCRYPTION_KEY")]];
  for (const raw of (spec.old ?? "").split(",")) {
    const item = raw.trim();
    if (!item) continue;
    const sep = item.indexOf(":");
    if (sep < 0) throw new FieldCryptoError("keyring", "each old key must be written id:base64");
    const id = item.slice(0, sep);
    entries.push([id, decodeKey(item.slice(sep + 1), `old key "${id}"`)]);
  }
  const keys = new Map<string, Buffer>();
  for (const [id, key] of entries) {
    if (!KEY_ID.test(id))
      throw new FieldCryptoError("keyring", `key id "${id}" must match ${String(KEY_ID)}`);
    if (keys.has(id)) throw new FieldCryptoError("keyring", `duplicate key id "${id}"`);
    for (const [otherId, other] of keys)
      if (other.equals(key))
        throw new FieldCryptoError("keyring", `key "${id}" reuses the key of "${otherId}"`);
    keys.set(id, key);
  }
  return { current: spec.id, ids: [...keys.keys()], keys };
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
