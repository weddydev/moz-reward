import "server-only";
import type { JobDef } from "./registry";

/**
 * Versioned job payloads (P0-18, ENGINEERING §5). Every job's data is `{ v, data }` (plus `outboxId` when the
 * job came from the outbox), so old and new workers coexist during a rolling deploy:
 * - an older payload is upgraded step by step (`upgrades[k]` turns version k into k + 1), then validated;
 * - a payload from a newer version than this worker knows is deferred (`future`) for a newer worker, never
 *   failed or dead-lettered;
 * - a bare payload (repeatable schedules registered before the envelope existed) counts as version 1.
 *
 * Changing a payload: bump `v` in the registry and add `upgrades[v - 1]`. Producers may switch at once: a new
 * worker reads both versions, an old worker defers the new one until it is replaced.
 */
export type Envelope = { v: number; data: unknown; outboxId?: string };

export type Opened =
  | { kind: "ok"; data: unknown; outboxId?: string }
  | { kind: "future"; v: number }
  | { kind: "invalid"; reason: string };

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const ENVELOPE_KEYS = new Set(["v", "data", "outboxId"]);

/** `{ v, data }` with nothing else (a job schema is never exactly that shape: payloads are strict objects). */
export function isEnvelope(raw: unknown): raw is Envelope {
  return (
    isRecord(raw) &&
    "v" in raw &&
    "data" in raw &&
    Object.keys(raw).every((k) => ENVELOPE_KEYS.has(k)) &&
    (raw.outboxId === undefined || typeof raw.outboxId === "string")
  );
}

/** Validates `payload` against the job's current schema and wraps it with the current version. */
export function sealEnvelope(def: JobDef, payload: unknown): Envelope {
  return { v: def.v, data: def.schema.parse(payload) };
}

export function openEnvelope(def: JobDef, raw: unknown): Opened {
  const envelope: Envelope = isEnvelope(raw) ? raw : { v: 1, data: raw };
  const { v } = envelope;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    return { kind: "invalid", reason: "bad version" };
  }
  if (v > def.v) return { kind: "future", v };
  let data = envelope.data;
  for (let from = v; from < def.v; from++) {
    const step = def.upgrades?.[from];
    if (!step) return { kind: "invalid", reason: `no upgrade from version ${String(from)}` };
    try {
      data = step(data);
    } catch {
      return { kind: "invalid", reason: `upgrade from version ${String(from)} failed` };
    }
  }
  const parsed = def.schema.safeParse(data);
  if (!parsed.success) return { kind: "invalid", reason: "payload does not match the schema" };
  return {
    kind: "ok",
    data: parsed.data,
    ...(envelope.outboxId ? { outboxId: envelope.outboxId } : {}),
  };
}
