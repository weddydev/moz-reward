import { describe, expect, it } from "vitest";
import { FieldCryptoError, openField, parseKeyring, sealField } from "./field-crypto";

const k1 = Buffer.alloc(32, 1).toString("base64");
const k2 = Buffer.alloc(32, 2).toString("base64");
const ctx = "customer_profiles.phone|7d1b6f0e-0000-4000-8000-000000000001";

describe("[P1-04] field encryption (AES-256-GCM, key id per value)", () => {
  it("round-trips, and two writes of the same value differ (random IV)", () => {
    const ring = parseKeyring({ key: k1, id: "k1" });
    const a = sealField(ring, "+447400123456", ctx);
    const b = sealField(ring, "+447400123456", ctx);
    expect(a.keyId).toBe("k1");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.ciphertext).not.toContain("447400123456");
    expect(openField(ring, a, ctx)).toBe("+447400123456");
    expect(openField(ring, b, ctx)).toBe("+447400123456");
  });

  it("after rotation: new writes carry the new key id and old values still decrypt", () => {
    const before = parseKeyring({ key: k1, id: "k1" });
    const old = sealField(before, "+447400123456", ctx);
    const after = parseKeyring({ key: k2, id: "k2", old: `k1:${k1}` });
    const fresh = sealField(after, "+447400999888", ctx);
    expect(fresh.keyId).toBe("k2");
    expect(openField(after, old, ctx)).toBe("+447400123456");
    expect(openField(after, fresh, ctx)).toBe("+447400999888");
  });

  it("fails loudly on an unknown key id, never returning garbage", () => {
    const sealed = sealField(parseKeyring({ key: k1, id: "k1" }), "x", ctx);
    const other = parseKeyring({ key: k2, id: "k2" });
    expect(() => openField(other, sealed, ctx)).toThrow(FieldCryptoError);
    expect(() => openField(other, sealed, ctx)).toThrow(/unknown key id "k1"/);
  });

  it("refuses a value moved to another row, relabelled with another key id, or edited", () => {
    const ring = parseKeyring({ key: k2, id: "k2", old: `k1:${k1}` });
    const sealed = sealField(ring, "+447400123456", ctx);
    const otherRow = "customer_profiles.phone|7d1b6f0e-0000-4000-8000-000000000002";
    expect(() => openField(ring, sealed, otherRow)).toThrow(/integrity/);
    expect(() => openField(ring, { ...sealed, keyId: "k1" }, ctx)).toThrow(/integrity/);
    expect(sealed.ciphertext.startsWith("v1.")).toBe(true);
    const bytes = Buffer.from(sealed.ciphertext.slice(3), "base64");
    bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 1;
    const edited = `v1.${bytes.toString("base64")}`;
    expect(() => openField(ring, { ...sealed, ciphertext: edited }, ctx)).toThrow(/integrity/);
    expect(() => openField(ring, { ...sealed, ciphertext: "v1.AAAA" }, ctx)).toThrow(/malformed/);
    expect(() =>
      openField(ring, { ...sealed, ciphertext: sealed.ciphertext.slice(3) }, ctx),
    ).toThrow(/malformed/);
  });

  it("the error never carries the plaintext, the key or the ciphertext", () => {
    const ring = parseKeyring({ key: k1, id: "k1" });
    const sealed = sealField(ring, "+447400123456", ctx);
    try {
      openField(ring, sealed, "customer_profiles.phone|other");
      expect.unreachable();
    } catch (err) {
      const text = `${String(err)} ${JSON.stringify(err)}`;
      expect(text).not.toContain("447400123456");
      expect(text).not.toContain(sealed.ciphertext);
      expect(text).not.toContain(k1);
    }
  });

  it("rejects a bad keyring: duplicate ids, a reused key, bad ids, wrong key length", () => {
    expect(() => parseKeyring({ key: k1, id: "k1", old: `k1:${k2}` })).toThrow(/duplicate key id/);
    expect(() => parseKeyring({ key: k1, id: "k2", old: `k1:${k1}` })).toThrow(/reuses the key/);
    expect(() => parseKeyring({ key: k1, id: "K 1" })).toThrow(/key id/);
    expect(() => parseKeyring({ key: k2, id: "k2", old: "k1" })).toThrow(/old key/);
    expect(() =>
      parseKeyring({ key: k2, id: "k2", old: `k1:${Buffer.alloc(16).toString("base64")}` }),
    ).toThrow(/32 bytes/);
    expect(() => parseKeyring({ key: k2, id: "k2", old: "" })).not.toThrow();
    expect(parseKeyring({ key: k2, id: "k2", old: ` k1:${k1} , ` }).ids).toEqual(["k2", "k1"]);
  });
});
