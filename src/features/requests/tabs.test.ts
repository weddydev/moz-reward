import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, parseTab, REQUEST_TABS } from "./tabs";

const ID = "0b7d3c3e-4f7a-4c55-9a51-0c6f1f0a2b11";

describe("[P2-02] Requests tabs", () => {
  it("[P2-02] reads each known tab from the URL", () => {
    for (const t of REQUEST_TABS) expect(parseTab(t)).toBe(t);
    expect(parseTab(["expired", "pending"])).toBe("expired");
  });

  it("[P2-02] falls back to Pending for a missing or unknown tab", () => {
    expect(parseTab(undefined)).toBe("pending");
    expect(parseTab("")).toBe("pending");
    expect(parseTab("rejected")).toBe("pending");
    expect(parseTab("__proto__")).toBe("pending");
  });
});

describe("[P2-02] Requests page cursor", () => {
  it("[P2-02] round-trips Postgres time text with microseconds and the row id", () => {
    const c = { at: "2026-11-28 09:14:05.123456+00", id: ID };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    const whole = { at: "2026-11-28 09:14:05+05:30", id: ID };
    expect(decodeCursor(encodeCursor(whole))).toEqual(whole);
  });

  it("[P2-02] ignores a cursor that isn't one of ours (first page instead)", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("not base64!")).toBeNull();
    expect(decodeCursor("A".repeat(200))).toBeNull();
    const enc = (s: string): string => Buffer.from(s).toString("base64url");
    expect(decodeCursor(enc(`2026-11-28 09:14:05+00|not-a-uuid`))).toBeNull();
    expect(decodeCursor(enc(`yesterday|${ID}`))).toBeNull();
    expect(decodeCursor(enc(`2026-11-28 09:14:05+00|${ID}|extra`))).toBeNull();
    expect(decodeCursor(enc(`2026-11-28 09:14:05+00'; drop table x;--|${ID}`))).toBeNull();
  });
});
