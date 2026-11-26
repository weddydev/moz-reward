import { describe, expect, it } from "vitest";
import {
  afterSend,
  clearQueue,
  dropQueued,
  enqueueRequest,
  keepOwnQueue,
  QUEUE_KEY,
  QUEUE_MAX,
  QUEUE_MAX_AGE_MS,
  type QueueStorage,
  queuedFor,
  readQueue,
} from "./request-queue";

const memory = (): QueueStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
};

const now = new Date("2026-11-25T16:55:00Z");
const ME = "user-me";
const entry = (shopId: string, key = `key-${shopId}`, at = now, userId = ME) => ({
  userId,
  shopId,
  key,
  at: at.toISOString(),
});

describe("[P1-11] offline request queue", () => {
  it("queues a tap and finds it again by shop", () => {
    const s = memory();
    expect(enqueueRequest(s, entry("a"), now)).toEqual(entry("a"));
    expect(queuedFor(s, ME, "a", now)).toEqual(entry("a"));
    expect(queuedFor(s, ME, "b", now)).toBeNull();
  });

  it("keeps the first queued tap for a shop (its key may already have reached the server)", () => {
    const s = memory();
    enqueueRequest(s, entry("a", "first"), now);
    expect(enqueueRequest(s, entry("a", "second"), now)?.key).toBe("first");
    expect(readQueue(s, ME, now)).toHaveLength(1);
  });

  it("drops a sent tap by key and clears the storage when empty", () => {
    const s = memory();
    enqueueRequest(s, entry("a"), now);
    enqueueRequest(s, entry("b"), now);
    dropQueued(s, ME, "key-a", now);
    expect(readQueue(s, ME, now).map((e) => e.shopId)).toEqual(["b"]);
    dropQueued(s, ME, "key-b", now);
    expect(s.data.has(QUEUE_KEY)).toBe(false);
  });

  it("leaves out taps older than 24 h and malformed entries", () => {
    const s = memory();
    const old = new Date(now.getTime() - QUEUE_MAX_AGE_MS);
    s.setItem(
      QUEUE_KEY,
      JSON.stringify([
        entry("old", "k1", old),
        { shopId: 1 },
        entry("ok"),
        { ...entry("x"), at: "soon" },
        // A tap queued before entries carried their user (no `userId`): nobody's, never sent.
        { shopId: "v1", key: "k2", at: now.toISOString() },
      ]),
    );
    expect(readQueue(s, ME, now).map((e) => e.shopId)).toEqual(["ok"]);
    s.setItem(QUEUE_KEY, "{not json");
    expect(readQueue(s, ME, now)).toEqual([]);
  });

  it("caps the queue", () => {
    const s = memory();
    for (let i = 0; i < QUEUE_MAX + 3; i++) enqueueRequest(s, entry(`s${String(i)}`), now);
    expect(readQueue(s, ME, now)).toHaveLength(QUEUE_MAX);
  });

  it("security review M1: a tap belongs to the account that made it; another account on the phone never sends it", () => {
    const s = memory();
    enqueueRequest(s, entry("a", "theirs", now, "user-other"), now);
    // Read, sent and dropped only by its own account.
    expect(readQueue(s, ME, now)).toEqual([]);
    expect(queuedFor(s, ME, "a", now)).toBeNull();
    dropQueued(s, ME, "theirs", now);
    expect(readQueue(s, "user-other", now).map((e) => e.key)).toEqual(["theirs"]);
    // When this account queues a tap, what another account left on the phone (signed out without the clean-up,
    // e.g. an expired session) is discarded, not kept for later.
    enqueueRequest(s, entry("a", "mine"), now);
    expect(readQueue(s, ME, now).map((e) => e.key)).toEqual(["mine"]);
    expect(readQueue(s, "user-other", now)).toEqual([]);
  });

  it("security review re-check LOW (P1-C close): the signed-in account's sender keeps only its own live taps on the phone", () => {
    const s = memory();
    const old = new Date(now.getTime() - QUEUE_MAX_AGE_MS);
    s.setItem(
      QUEUE_KEY,
      JSON.stringify([
        entry("a", "theirs", now, "user-other"),
        entry("b", "stale", old),
        entry("c"),
      ]),
    );
    keepOwnQueue(s, ME, now);
    expect(JSON.parse(s.getItem(QUEUE_KEY) ?? "[]")).toEqual([entry("c")]);
    // Nothing of this account's left: the key goes.
    keepOwnQueue(s, "user-new", now);
    expect(s.data.has(QUEUE_KEY)).toBe(false);
    expect(() => {
      keepOwnQueue(null, ME, now);
    }).not.toThrow();
  });

  it("security review M1: signing out clears the queue on this phone", () => {
    const s = memory();
    enqueueRequest(s, entry("a"), now);
    clearQueue(s);
    expect(s.data.has(QUEUE_KEY)).toBe(false);
    expect(() => {
      clearQueue(null);
    }).not.toThrow();
  });

  it("works without storage, and survives storage that throws", () => {
    expect(enqueueRequest(null, entry("a"), now)).toBeNull();
    expect(readQueue(null, ME, now)).toEqual([]);
    const broken: QueueStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(enqueueRequest(broken, entry("a"), now)).toBeNull();
    expect(() => {
      dropQueued(broken, ME, "k", now);
    }).not.toThrow();
    expect(() => {
      clearQueue(broken);
    }).not.toThrow();
  });

  it("keeps a tap when there was no answer or a short-lived refusal, drops it otherwise", () => {
    expect(afterSend({ thrown: true })).toBe("keep");
    expect(afterSend({ ok: false, code: "RATE_LIMITED" })).toBe("keep");
    expect(afterSend({ ok: false, code: "UNAVAILABLE" })).toBe("keep");
    expect(afterSend({ ok: false, code: "UNAUTHENTICATED" })).toBe("keep");
    expect(afterSend({ ok: true })).toBe("drop");
    for (const code of ["LIMIT_REACHED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "VALIDATION"])
      expect(afterSend({ ok: false, code })).toBe("drop");
  });
});
