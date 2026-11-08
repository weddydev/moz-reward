import { describe, expect, it, vi } from "vitest";
import {
  CODE_ALPHABET,
  CodeCollisionError,
  formatCode,
  formatMemberId,
  generateCode,
  withUniqueCode,
} from "./codes";

describe("[P0-03] code generator", () => {
  it("emits only allowed characters at the requested length", () => {
    for (let i = 0; i < 2000; i++) {
      const code = generateCode(6);
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
    }
    expect(generateCode(8)).toHaveLength(8);
  });

  it("never uses the confusable characters 0, O, 1, I, L (or U)", () => {
    for (const ch of "0O1ILU") expect(CODE_ALPHABET).not.toContain(ch);
    expect(CODE_ALPHABET).toHaveLength(30);
  });

  it("is roughly uniform over 10k samples (distribution sanity)", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 10_000; i++)
      for (const ch of generateCode(6)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    const expected = 60_000 / CODE_ALPHABET.length; // 2000 per character
    expect(counts.size).toBe(CODE_ALPHABET.length);
    for (const n of counts.values()) expect(Math.abs(n - expected) / expected).toBeLessThan(0.15);
  });

  it("formats member IDs as XXX-XXX", () => {
    expect(formatMemberId("K7Q42M")).toBe("K7Q-42M");
  });

  it("retries on a unique violation and returns the first code that inserts", async () => {
    const unique = Object.assign(new Error("dup"), { code: "23505" });
    const insert = vi
      .fn()
      .mockRejectedValueOnce(unique)
      .mockRejectedValueOnce(unique)
      .mockResolvedValueOnce("row");
    await expect(withUniqueCode(insert, { length: 6 })).resolves.toBe("row");
    expect(insert).toHaveBeenCalledTimes(3);
  });

  it("also recognises a unique violation wrapped in `cause` (Drizzle errors)", async () => {
    const wrapped = Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
    const insert = vi.fn().mockRejectedValueOnce(wrapped).mockResolvedValueOnce("ok");
    await expect(withUniqueCode(insert, { length: 6 })).resolves.toBe("ok");
  });

  it("gives up after 5 attempts with a clear error", async () => {
    const insert = vi.fn().mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" }));
    await expect(withUniqueCode(insert, { length: 6 })).rejects.toBeInstanceOf(CodeCollisionError);
    expect(insert).toHaveBeenCalledTimes(5);
  });

  it("does not retry other errors", async () => {
    const insert = vi.fn().mockRejectedValue(new Error("connection lost"));
    await expect(withUniqueCode(insert, { length: 6 })).rejects.toThrow("connection lost");
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("[P0-03] code format and length", () => {
  it("formats codes in configurable groups and separators", () => {
    expect(formatCode("K7Q42MXA", { group: 4 })).toBe("K7Q4-2MXA");
    expect(formatCode("K7Q42MX", { group: 3, separator: " " })).toBe("K7Q 42M X");
    expect(() => formatCode("ABC", { group: 0 })).toThrow(RangeError);
  });

  it("refuses lengths too short to be safe or not whole numbers", () => {
    for (const bad of [0, 3, 33, 6.5, Number.NaN])
      expect(() => generateCode(bad)).toThrow(RangeError);
    expect(generateCode(4)).toHaveLength(4);
    expect(generateCode(32)).toHaveLength(32);
  });
});
