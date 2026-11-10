import { describe, expect, it } from "vitest";
import { BROWSER_SENTRY_DSN } from "@/lib/sentry-scrub";
import {
  envelopeUrl,
  filterEnvelope,
  TUNNEL_MAX_BYTES,
  tunnelResponse,
} from "@/server/observability/tunnel";
import { readUsage } from "@/server/ops/usage";

/** P0-13: the browser's Sentry tunnel is not an open relay and never forwards PII or non-error items. */
const DSN = "https://publickey@o123.ingest.sentry.io/456";
const ORIGIN = "http://localhost:3000";

function envelope(dsn: string, items: Array<[Record<string, unknown>, unknown]>): string {
  return [
    JSON.stringify({ dsn, sent_at: new Date().toISOString() }),
    ...items.flatMap(([h, b]) => [JSON.stringify(h), JSON.stringify(b)]),
  ].join("\n");
}

const post = (body: string, headers: Record<string, string> = { origin: ORIGIN }): Request =>
  new Request(`${ORIGIN}/api/monitoring`, { method: "POST", headers, body });

function capture(): {
  calls: Array<{ url: string; body: string }>;
  forward: (u: string, b: string) => Promise<boolean>;
} {
  const calls: Array<{ url: string; body: string }> = [];
  return {
    calls,
    forward: async (url, body) => {
      calls.push({ url, body });
      return true;
    },
  };
}

const errorEvent = {
  message: "boom for jane@example.com",
  request: {
    url: "http://localhost:3000/sign-in/confirm?token=abc",
    headers: { Referer: "x", "User-Agent": "UA" },
  },
  user: { ip_address: "203.0.113.9" },
};

describe("[P0-13] Sentry tunnel (/api/monitoring)", () => {
  it("forwards our DSN's event items, scrubbed again, to the project's envelope endpoint", async () => {
    const box = capture();
    const res = await tunnelResponse(
      post(
        envelope(BROWSER_SENTRY_DSN, [
          [{ type: "event" }, errorEvent],
          [{ type: "session" }, { sid: "s" }],
        ]),
      ),
      { dsn: DSN, forward: box.forward, budget: () => Promise.resolve(true) },
    );
    expect(res.status).toBe(204);
    expect(box.calls).toHaveLength(1);
    expect(box.calls[0]?.url).toBe("https://o123.ingest.sentry.io/api/456/envelope/");
    const body = box.calls[0]?.body ?? "";
    expect(body).not.toMatch(/jane|token=abc|203\.0\.113\.9|"session"/);
    const lines = body.split("\n").filter(Boolean);
    expect(lines).toHaveLength(3); // header + one event item (header + payload)
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ dsn: DSN }); // the real DSN, added server-side
    expect(JSON.parse(lines[2] ?? "{}")).toMatchObject({
      environment: "test",
      tags: { process: "browser" },
    });
  });

  it("an envelope naming any other DSN is refused (never an open relay)", async () => {
    const box = capture();
    const res = await tunnelResponse(
      post(envelope("https://otherkey@o999.ingest.sentry.io/1", [[{ type: "event" }, errorEvent]])),
      { dsn: DSN, forward: box.forward },
    );
    expect(res.status).toBe(400);
    expect(box.calls).toHaveLength(0);
  });

  it("cross-site posts are refused; oversize and malformed envelopes too", async () => {
    const box = capture();
    const body = envelope(BROWSER_SENTRY_DSN, [[{ type: "event" }, errorEvent]]);
    expect(
      (
        await tunnelResponse(post(body, { origin: "https://evil.example" }), {
          dsn: DSN,
          forward: box.forward,
        })
      ).status,
    ).toBe(403);
    const big = envelope(BROWSER_SENTRY_DSN, [
      [{ type: "event" }, { message: "x".repeat(TUNNEL_MAX_BYTES) }],
    ]);
    expect((await tunnelResponse(post(big), { dsn: DSN, forward: box.forward })).status).toBe(413);
    expect(
      (await tunnelResponse(post("not json\n{}"), { dsn: DSN, forward: box.forward })).status,
    ).toBe(400);
    expect(box.calls).toHaveLength(0);
  });

  it("without SENTRY_DSN (local/test) envelopes are accepted and dropped", async () => {
    const box = capture();
    const res = await tunnelResponse(
      post(envelope(BROWSER_SENTRY_DSN, [[{ type: "event" }, errorEvent]])),
      {
        dsn: undefined,
        forward: box.forward,
      },
    );
    expect(res.status).toBe(204);
    expect(box.calls).toHaveLength(0);
  });

  it("an upstream failure is swallowed: the browser always gets 204", async () => {
    const res = await tunnelResponse(
      post(envelope(BROWSER_SENTRY_DSN, [[{ type: "event" }, errorEvent]])),
      {
        dsn: DSN,
        forward: () => Promise.reject(new Error("ECONNRESET")),
        budget: () => Promise.resolve(true),
      },
    );
    expect(res.status).toBe(204);
  });

  it("helpers: envelope URL from a DSN; only event items survive the filter", () => {
    expect(envelopeUrl("https://k@o1.ingest.de.sentry.io/42")).toBe(
      "https://o1.ingest.de.sentry.io/api/42/envelope/",
    );
    const f = filterEnvelope(
      envelope(BROWSER_SENTRY_DSN, [
        [{ type: "replay_event" }, {}],
        [{ type: "attachment" }, {}],
      ]),
    );
    expect(f?.events).toBe(0);
  });
});

describe("[P0-13] security review HIGH-1: the tunnel can't silence server reporting or burn the quota", () => {
  const always = (): Promise<boolean> => Promise.resolve(true);

  it("an envelope naming another DSN is refused before any budget is touched", async () => {
    let budgetCalls = 0;
    const res = await tunnelResponse(
      post(
        envelope(
          "https://k@o9.ingest.sentry.io/9",
          Array.from(
            { length: 30 },
            () => [{ type: "event" }, errorEvent] as [Record<string, unknown>, unknown],
          ),
        ),
      ),
      {
        dsn: DSN,
        forward: capture().forward,
        budget: () => {
          budgetCalls++;
          return Promise.resolve(true);
        },
      },
    );
    expect(res.status).toBe(400);
    expect(budgetCalls).toBe(0);
  });

  it("only the first event of an envelope is forwarded; browser tags are replaced", async () => {
    const box = capture();
    const items = Array.from(
      { length: 30 },
      (_, i) =>
        [
          { type: "event" },
          { ...errorEvent, tags: { evil: `t${String(i)}`, user_email: "x@y.z" } },
        ] as [Record<string, unknown>, unknown],
    );
    await tunnelResponse(post(envelope(BROWSER_SENTRY_DSN, items)), {
      dsn: DSN,
      forward: box.forward,
      budget: always,
    });
    expect(box.calls).toHaveLength(1);
    const lines = (box.calls[0]?.body ?? "").split("\n").filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[2] ?? "{}")).toMatchObject({ tags: { process: "browser" } });
    expect(lines[2]).not.toMatch(/evil|x@y\.z/);
  });

  it("the shared browser budget forwards at most 20 events per 10 minutes", async () => {
    const box = capture();
    for (let i = 0; i < 25; i++) {
      await tunnelResponse(post(envelope(BROWSER_SENTRY_DSN, [[{ type: "event" }, errorEvent]])), {
        dsn: DSN,
        forward: box.forward,
      });
    }
    expect(box.calls.length).toBeLessThanOrEqual(20);
    expect(box.calls.length).toBeGreaterThan(0);
  });

  it("an upstream rejection (Sentry over quota, 429) is not counted as sent", async () => {
    const before = (await readUsage()).sentryMonth;
    await tunnelResponse(post(envelope(BROWSER_SENTRY_DSN, [[{ type: "event" }, errorEvent]])), {
      dsn: DSN,
      forward: () => Promise.resolve(false),
      budget: always,
    });
    await new Promise((r) => setTimeout(r, 50));
    expect((await readUsage()).sentryMonth).toBe(before);
  });
});
