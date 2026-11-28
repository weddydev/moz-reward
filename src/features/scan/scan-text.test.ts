import { describe, expect, it } from "vitest";
import type { MemberId } from "@/lib/brand";
import {
  deriveMemberQrKeys,
  MEMBER_QR_TOKEN_LENGTH,
  signMemberQr,
} from "@/server/security/member-qr";
import { MEMBER_ID_TYPING, MEMBER_QR_SHAPE, readScanText, typedMemberId } from "./scan-text";

const keys = deriveMemberQrKeys(Buffer.alloc(32, 7).toString("base64"));

describe("[P2-02] scanned text", () => {
  it("[P2-02] a real member-QR token reads as a member token; the client shape matches the server's length", () => {
    const { token } = signMemberQr("K7Q42M" as MemberId, Date.now(), keys);
    expect(token).toHaveLength(MEMBER_QR_TOKEN_LENGTH);
    expect(MEMBER_QR_SHAPE.test(token)).toBe(true);
    expect(readScanText(`  ${token}\n`)).toEqual({ kind: "member", token });
  });

  it("[P2-02] a shop's entry QR gets its own hint; anything else is not a member QR (never sent)", () => {
    expect(readScanText("https://mozrewards.co.uk/s/BREW42?src=qr")).toEqual({ kind: "shop" });
    expect(readScanText("http://localhost:3100/s/K7Q42M")).toEqual({ kind: "shop" });
    for (const other of [
      "",
      "MQ1.short",
      "MQ2." + "A".repeat(58),
      "MQ1." + "A".repeat(57) + "=",
      "MQ1." + "A".repeat(59),
      "K7Q-42M",
      "https://evil.example/login",
      "https://mozrewards.co.uk/shops/x",
    ]) {
      expect(readScanText(other), other).toEqual({ kind: "other" });
    }
  });

  it("[P2-02] typed member IDs forgive the dash, spaces and case, and refuse confusables and wrong lengths", () => {
    expect(typedMemberId("k7q-42m")).toBe("K7Q42M");
    expect(typedMemberId(" K7Q 42M ")).toBe("K7Q42M");
    expect(typedMemberId("K7Q-42")).toBeNull();
    expect(typedMemberId("I0O-1LL")).toBeNull();
    expect(MEMBER_ID_TYPING.test("K7Q-42M")).toBe(true);
    expect(MEMBER_ID_TYPING.test("K7Q42M")).toBe(true);
    expect(MEMBER_ID_TYPING.test("K7Q-42M1")).toBe(false);
    expect(MEMBER_ID_TYPING.test("K7--42")).toBe(false);
    expect(MEMBER_ID_TYPING.test("K7Q 42")).toBe(false);
  });
});
