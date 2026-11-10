import { createServer, type Server } from "node:http";
import { Writable } from "node:stream";
import * as Sentry from "@sentry/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { logBetterAuth } from "@/server/auth/logger";
import { requireAdminRole } from "@/server/authz";
import { loadPrincipal, runAsPrincipal } from "@/server/authz/principal";
import { createLogger, type Logger } from "@/server/log";
import {
  allowSentryEvent,
  initSentry,
  reportFatal,
  reportUnexpected,
  SENTRY_CAP,
} from "@/server/observability/sentry";
import { readUsage } from "@/server/ops/usage";
import { makeActor } from "@/server/testing/factories";
import type { AddressInfo } from "node:net";

/**
 * P0-13 AC1 / C-03 / C-26: a test error reaches Sentry with the request id and no PII; unexpected errors from
 * the action template are reported; Better Auth's logger writes through pino. "Sentry" is a local HTTP server
 * speaking the envelope endpoint (the real account is H-34), so the evidence is the exact bytes the SDK sends.
 */
type Envelope = { header: Record<string, unknown>; items: Array<{ type: string; body: unknown }> };

const received: Envelope[] = [];
let server: Server;

function parseEnvelope(raw: string): Envelope {
  const lines = raw.split("\n").filter(Boolean);
  const header = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
  const items: Envelope["items"] = [];
  for (let i = 1; i + 1 < lines.length; i += 2) {
    const itemHeader = JSON.parse(lines[i] ?? "{}") as { type: string };
    items.push({ type: itemHeader.type, body: JSON.parse(lines[i + 1] ?? "null") as unknown });
  }
  return { header, items };
}

type SentEvent = {
  tags?: Record<string, string>;
  environment?: string;
  user?: unknown;
  exception?: { values?: Array<{ value?: string }> };
};

async function nextEvent(match: (e: SentEvent) => boolean): Promise<SentEvent> {
  await Sentry.flush(2_000);
  for (const env of received) {
    for (const item of env.items) {
      if (item.type === "event" && match(item.body as SentEvent)) return item.body as SentEvent;
    }
  }
  throw new Error(`no matching event among ${String(received.length)} envelopes`);
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      if (req.url?.startsWith("/api/1/envelope/")) received.push(parseEnvelope(body));
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  expect(initSentry("web", { dsn: `http://publickey@127.0.0.1:${String(port)}/1` })).toBe(true);
});

afterAll(async () => {
  await Sentry.close(1_000);
  await new Promise((r) => server.close(r));
});

describe("[P0-13] AC1: errors reach Sentry with the request id and no PII", () => {
  it("reportUnexpected: request id and where as tags, environment set, email scrubbed, no user", async () => {
    reportUnexpected(new Error("boom for jane.doe@example.com"), {
      where: "test.probe",
      requestId: "req-sentry-1",
    });
    const event = await nextEvent((e) => e.tags?.request_id === "req-sentry-1");
    expect(event.tags).toMatchObject({ where: "test.probe", process: "web" });
    expect(event.environment).toBe("test");
    expect(event.user).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("jane.doe");
    expect(event.exception?.values?.[0]?.value).toBe("boom for [redacted]");
  });

  it("an action whose handler throws is reported (where = action name) and still answers INTERNAL", async () => {
    const { user } = await makeActor("admin_owner");
    const admin = await loadPrincipal({
      userId: user.id,
      mfaVerified: true,
      sessionCreatedAt: new Date(),
    });
    const explodes = defineAction({
      name: "test.sentryExplodes",
      input: z.object({}).strict(),
      authorize: (_i, p) => requireAdminRole(["owner"], p),
      audit: () => ({ action: "test.sentry", entity: "none" }),
      handler: () => Promise.reject(new TypeError("cannot read x of undefined")),
    });
    const res = await runAsPrincipal(admin, () => explodes({}));
    expect(res).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const event = await nextEvent((e) => e.tags?.where === "test.sentryExplodes");
    expect(event.tags?.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.exception?.values?.[0]?.value).toBe("cannot read x of undefined");
  });

  it("every sent event is counted for the 70% quota alert", async () => {
    const before = (await readUsage()).sentryMonth;
    reportUnexpected(new Error("count me"), { where: "test.count" });
    await nextEvent((e) => e.tags?.where === "test.count");
    await new Promise((r) => setTimeout(r, 50));
    expect((await readUsage()).sentryMonth).toBe(before + 1);
  });
});

describe("[P0-13] security re-review: a crash is reported before the process may exit", () => {
  it("reportFatal resolves only once the event has been delivered (no flush by the caller)", async () => {
    const before = received.length;
    await reportFatal(new Error("worker crash probe"), "test.fatal", 3_000);
    const delivered = received.slice(before).flatMap((e) => e.items);
    expect(delivered.some((i) => (i.body as SentEvent).tags?.where === "test.fatal")).toBe(true);
  });
});

describe("[P0-13] C-03: Better Auth's logger writes through pino", () => {
  it("a library warning is a JSON pino line, scrubbed; an error goes to Sentry too", async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const holder = (globalThis as { __mozLog?: { logger?: Logger | undefined } }).__mozLog ?? {};
    const original = holder.logger;
    holder.logger = createLogger({ destination: sink, level: "info" });
    try {
      logBetterAuth("warn", "Invalid password for jane@example.com", { user: { email: "x@y.z" } });
      logBetterAuth("error", "adapter failed", new Error("db down"));
    } finally {
      holder.logger = original;
    }
    const parsed = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(parsed[0]).toMatchObject({
      level: 40,
      src: "better-auth",
      msg: "Invalid password for [redacted]",
      args: ["[object]"],
    });
    expect(parsed[1]).toMatchObject({ level: 50, src: "better-auth", msg: "adapter failed" });
    expect(JSON.stringify(parsed)).not.toContain("x@y.z");
    const event = await nextEvent((e) => e.tags?.where === "better-auth");
    expect(event.exception?.values?.[0]?.value).toBe("db down");
  });
});

describe("[P0-13] Sentry quota: per-process cap (edge case: a crash loop can't exhaust the free quota)", () => {
  it(`allows ${String(SENTRY_CAP.events)} events per window, then drops until the next window`, () => {
    const t0 = Date.now() + 10 * SENTRY_CAP.windowMs; // a fresh window, after every event above
    let allowed = 0;
    for (let i = 0; i < SENTRY_CAP.events + 10; i++) if (allowSentryEvent(t0 + i)) allowed++;
    expect(allowed).toBe(SENTRY_CAP.events);
    expect(allowSentryEvent(t0 + SENTRY_CAP.windowMs)).toBe(true);
  });
});
