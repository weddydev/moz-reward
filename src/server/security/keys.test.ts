import { describe, expect, it } from "vitest";
import { derivePurposeKey, PURPOSES } from "./keys";

const ikm = Buffer.alloc(32, 7).toString("base64");

describe("[P0-19] per-purpose keys (L10: no HMAC reuses AUTH_SECRET)", () => {
  it("derives a different 32-byte key for every purpose, the same one every time", () => {
    const keys = PURPOSES.map((p) => derivePurposeKey(ikm, p));
    expect(new Set(keys.map((k) => k.toString("hex"))).size).toBe(PURPOSES.length);
    for (const k of keys) expect(k).toHaveLength(32);
    expect(derivePurposeKey(ikm, "email-key").equals(derivePurposeKey(ikm, "email-key"))).toBe(
      true,
    );
  });

  it("changes with the master key, and is never the master key itself", () => {
    const other = Buffer.alloc(32, 8).toString("base64");
    expect(derivePurposeKey(ikm, "ip-hash").equals(derivePurposeKey(other, "ip-hash"))).toBe(false);
    expect(derivePurposeKey(ikm, "ip-hash").equals(Buffer.from(ikm, "base64"))).toBe(false);
  });
});
