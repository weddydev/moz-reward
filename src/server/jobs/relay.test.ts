import { describe, expect, it } from "vitest";
import { parseReplaySince, relayEnvelope, retryDelaySec } from "./relay";

describe("[P0-18] outbox relay helpers", () => {
  it("backs off exponentially from 1 s and caps at 5 min", () => {
    expect([1, 2, 3, 4, 9, 10, 50].map(retryDelaySec)).toEqual([1, 2, 4, 8, 256, 300, 300]);
    expect(retryDelaySec(0)).toBe(1);
  });

  it("tags the stored envelope with the outbox id (a bare legacy payload becomes version 1)", () => {
    expect(relayEnvelope({ id: "o1", payload: { v: 2, data: { a: 1 } } })).toEqual({
      v: 2,
      data: { a: 1 },
      outboxId: "o1",
    });
    expect(relayEnvelope({ id: "o2", payload: { a: 1 } })).toEqual({
      v: 1,
      data: { a: 1 },
      outboxId: "o2",
    });
  });

  it("--replay-since needs an ISO time with a zone, not in the future", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    expect(parseReplaySince("2026-11-10T09:30:00Z", now)).toEqual({
      ok: true,
      since: new Date("2026-11-10T09:30:00Z"),
    });
    expect(parseReplaySince("2026-07-10T09:30:00+01:00", now)).toEqual({
      ok: true,
      since: new Date("2026-07-10T08:30:00Z"),
    });
    for (const bad of [undefined, "", "2026-11-10 09:30", "2026-11-10T09:30:00", "yesterday"])
      expect(parseReplaySince(bad, now).ok).toBe(false);
    expect(parseReplaySince("2026-11-10T12:00:01Z", now)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/future/) as unknown,
    });
    expect(parseReplaySince("2026-02-30T09:30:00Z", now).ok).toBe(false);
  });
});
