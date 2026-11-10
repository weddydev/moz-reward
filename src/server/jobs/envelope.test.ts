import { describe, expect, it } from "vitest";
import { z } from "zod";
import { openEnvelope, sealEnvelope } from "./envelope";
import { defineJob } from "./registry";

// Version 1 sent `{ userId }`; version 2 renamed it and added a field; version 3 made `channel` an enum.
const v1 = defineJob(z.object({ userId: z.uuid() }).strict());
const v3 = defineJob(
  z.object({ customerId: z.uuid(), channel: z.enum(["email", "push"]) }).strict(),
  {
    v: 3,
    upgrades: {
      1: (d) => {
        const { userId } = d as { userId: string };
        return { customerId: userId, channel: "email" };
      },
      2: (d) => d,
    },
  },
);
const id = "0190a0b0-0000-7000-8000-000000000001";

describe("[P0-18] job payload envelope (versioning, AC4)", () => {
  it("seals the payload with the job's current version, after validating it", () => {
    expect(sealEnvelope(v1, { userId: id })).toEqual({ v: 1, data: { userId: id } });
    expect(() => sealEnvelope(v1, { userId: "not-a-uuid" })).toThrow();
  });

  it("a version-1 payload is upgraded step by step and processed by version 3", () => {
    const opened = openEnvelope(v3, { v: 1, data: { userId: id } });
    expect(opened).toEqual({ kind: "ok", data: { customerId: id, channel: "email" } });
  });

  it("a bare payload (scheduled jobs from before the envelope) counts as version 1", () => {
    expect(openEnvelope(v3, { userId: id })).toEqual({
      kind: "ok",
      data: { customerId: id, channel: "email" },
    });
    expect(openEnvelope(defineJob(z.object({}).strict()), {})).toEqual({ kind: "ok", data: {} });
  });

  it("a payload from a newer version is deferred, not failed (rolling deploy: old worker, new web)", () => {
    expect(openEnvelope(v1, { v: 2, data: { anything: true } })).toEqual({ kind: "future", v: 2 });
  });

  it("refuses a payload that is invalid after upgrading, or has no upgrade step", () => {
    expect(openEnvelope(v3, { v: 1, data: { userId: "x" } })).toMatchObject({ kind: "invalid" });
    // Built by hand: defineJob itself refuses a gap (last test).
    const gap = {
      v: 3,
      schema: z.object({}).strict(),
      runAs: "system" as const,
      upgrades: { 2: (d: unknown) => d },
    };
    expect(openEnvelope(gap, { v: 1, data: {} })).toEqual({
      kind: "invalid",
      reason: "no upgrade from version 1",
    });
    expect(openEnvelope(v1, { v: 0, data: {} })).toMatchObject({ kind: "invalid" });
  });

  it("carries the outbox id through, so the worker can mark the row complete", () => {
    expect(openEnvelope(v1, { v: 1, data: { userId: id }, outboxId: id })).toEqual({
      kind: "ok",
      data: { userId: id },
      outboxId: id,
    });
  });

  it("defineJob refuses a version without its upgrade chain declared", () => {
    expect(() => defineJob(z.object({}), { v: 2 })).toThrow(/upgrade/);
  });
});
