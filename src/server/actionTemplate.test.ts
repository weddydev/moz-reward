import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { mintShopScope } from "./authz/scope";
import { AppError } from "./errors";
import type { HandlerTools } from "./actionTemplate";
import type { Principal } from "./authz/policies";
import type * as RateLimit from "./security/rate-limit";

const calls: string[] = [];
const fakeTx = { fake: "tx" };
const logged: Array<{ fields: unknown; msg: string; ctx: unknown }> = [];

const state = vi.hoisted(() => ({
  principal: null as Principal | null,
  headers: null as Headers | null,
  rateLimited: false,
}));

vi.mock("next/headers", () => ({
  headers: () => {
    if (!state.headers) throw new Error("outside a request");
    return Promise.resolve(state.headers);
  },
}));
vi.mock("./authz/principal", () => ({
  currentPrincipal: () => {
    calls.push("authenticate");
    return Promise.resolve(state.principal);
  },
}));
vi.mock("./repos/_base", () => ({
  transaction: async (_scope: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    calls.push("transaction:begin");
    const out = await fn(fakeTx);
    calls.push("transaction:commit");
    return out;
  },
}));
// Real key/policy helpers (pure); only the Redis call is replaced.
vi.mock("./security/rate-limit", async (actual) => ({
  ...(await actual<typeof RateLimit>()),
  limitOrThrow: (opts: { key: string }) => {
    calls.push(`rateLimit:${opts.key}`);
    if (state.rateLimited)
      throw new AppError("RATE_LIMITED", undefined, undefined, { retryAfterSec: 42 });
    return Promise.resolve({ ok: true });
  },
}));
vi.mock("./services/audit", () => ({
  audit: (tx: unknown, entry: { action: string; actor: unknown; ip?: string }) => {
    calls.push(`audit:${entry.action}:${tx === fakeTx ? "in-tx" : "no-tx"}:${String(entry.ip)}`);
    return Promise.resolve();
  },
}));
vi.mock("./log", () => ({
  requestLogger: (requestId: string, ctx: Record<string, unknown>) => ({
    error: (fields: unknown, msg: string) =>
      logged.push({ fields, msg, ctx: { requestId, ...ctx } }),
    info: () => undefined,
  }),
}));

const { defineAction, defineRoute } = await import("./actionTemplate");

const SHOP = "0192f0c1-0000-7000-8000-000000000001";
const signedIn: Principal = {
  userId: "u1",
  mfaVerified: true,
  sessionCreatedAt: new Date(),
  shopRoles: [{ shopId: SHOP, role: "owner", perAwardLimit: null }],
  adminRole: null,
};
const input = z.object({ shopId: z.uuid(), name: z.string().min(1).max(10) }).strict();
const scope = mintShopScope({ userId: "u1", shopId: SHOP, role: "owner" });

// Loosely typed overrides: each test swaps one step of the template.
function sample(over: Record<string, unknown> = {}) {
  return defineAction({
    name: "shop.rename",
    input,
    authorize: ({ shopId }: { shopId: string }, p: Principal | null) => {
      calls.push(`authorize:${shopId}:${p ? p.userId : "anon"}`);
      return Promise.resolve(scope);
    },
    rateLimit: { max: 5, windowSec: 60 },
    audit: ({ shopId }: { shopId: string }) => ({
      action: "shop.rename",
      entity: "shop",
      entityId: shopId,
    }),
    handler: ({ name }: { name: string }, _ctx: unknown, { tx, afterCommit }: HandlerTools) => {
      calls.push(`handler:${(tx as unknown) === fakeTx ? "in-tx" : "no-tx"}`);
      afterCommit(() => calls.push("afterCommit"));
      return Promise.resolve(`renamed:${name}`);
    },
    ...over,
  } as Parameters<typeof defineAction>[0]);
}

beforeEach(() => {
  calls.length = 0;
  logged.length = 0;
  state.principal = signedIn;
  state.headers = new Headers({ "x-request-id": "req-12345678" });
  state.rateLimited = false;
});

describe("[P0-07] defineAction runs the ENGINEERING §4 steps in order", () => {
  it("authenticate → validate → authorise → rate limit → handler in tx → audit in tx → commit → after-commit", async () => {
    const res = await sample()({ shopId: SHOP, name: "Brew" });

    expect(res).toEqual({ ok: true, data: "renamed:Brew" });
    expect(calls).toEqual([
      "authenticate",
      `authorize:${SHOP}:u1`,
      "rateLimit:action:shop.rename:user:u1",
      "transaction:begin",
      "handler:in-tx",
      "audit:shop.rename:in-tx:local",
      "transaction:commit",
      "afterCommit",
    ]);
  });

  it("refuses anonymous callers before looking at the input", async () => {
    state.principal = null;
    const res = await sample()({ nonsense: true });
    expect(res).toEqual({
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." },
    });
    expect(calls).toEqual(["authenticate"]);
  });

  it("public actions let anonymous callers reach the policy, rate limited per IP", async () => {
    state.principal = null;
    const res = await sample({ public: true })({ shopId: SHOP, name: "Brew" });
    expect(res.ok).toBe(true);
    expect(calls).toContain(`authorize:${SHOP}:anon`);
    expect(calls).toContain("rateLimit:action:shop.rename:ip:local");
  });

  it("returns field errors for invalid input and never authorises", async () => {
    const res = await sample()({ shopId: "not-a-uuid", name: "", extra: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("VALIDATION");
      expect(res.error.message).toBe("Please check the highlighted fields.");
      expect(Object.keys(res.error.fieldErrors ?? {}).sort()).toEqual(["_", "name", "shopId"]);
    }
    expect(calls).toEqual(["authenticate"]);
  });

  it("stops at a policy denial: no rate-limit hit, no handler, no audit", async () => {
    const res = await sample({
      authorize: () => Promise.reject(new AppError("FORBIDDEN")),
    })({ shopId: SHOP, name: "Brew" });
    expect(res).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "You don't have access to this." },
    });
    expect(calls).toEqual(["authenticate"]);
  });

  it("stops when rate limited, before any write", async () => {
    state.rateLimited = true;
    const res = await sample()({ shopId: SHOP, name: "Brew" });
    expect(res).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    expect(calls.some((c) => c.startsWith("handler") || c.startsWith("transaction"))).toBe(false);
  });

  it("an unexpected error is logged with the request id and shown as a generic message; nothing after it runs", async () => {
    const res = await sample({
      handler: (_i: unknown, _c: unknown, { afterCommit }: HandlerTools) => {
        afterCommit(() => calls.push("afterCommit"));
        return Promise.reject(new Error("db exploded: password=hunter2"));
      },
    })({ shopId: SHOP, name: "Brew" });

    expect(res).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "Something went wrong. Please try again." },
    });
    expect(JSON.stringify(res)).not.toContain("hunter2");
    expect(calls).not.toContain("transaction:commit");
    expect(calls.some((c) => c.startsWith("audit") || c === "afterCommit")).toBe(false);
    expect(logged).toEqual([
      expect.objectContaining({
        msg: "unexpected error",
        ctx: { requestId: "req-12345678", action: "shop.rename" },
      }),
    ]);
  });

  it("a failing after-commit side effect is logged but the committed action still succeeds", async () => {
    const res = await sample({
      handler: (_i: unknown, _c: unknown, { afterCommit }: HandlerTools) => {
        afterCommit(() => Promise.reject(new Error("smtp down")));
        return Promise.resolve("ok");
      },
    })({ shopId: SHOP, name: "Brew" });
    expect(res).toEqual({ ok: true, data: "ok" });
    expect(logged.map((l) => l.msg)).toEqual(["after-commit side effect failed"]);
  });

  it("without audit or transaction the handler runs without a transaction", async () => {
    const res = await sample({ audit: undefined, rateLimit: undefined })({
      shopId: SHOP,
      name: "Brew",
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["authenticate", `authorize:${SHOP}:u1`, "handler:no-tx", "afterCommit"]);
  });

  it("an audit callback returning null writes no audit row", async () => {
    await sample({ audit: () => null })({ shopId: SHOP, name: "Brew" });
    expect(calls.some((c) => c.startsWith("audit"))).toBe(false);
    expect(calls).toContain("transaction:commit");
  });

  it("uses a custom rate-limit key when given, and works outside a request (no headers)", async () => {
    state.headers = null;
    await sample({
      rateLimit: {
        max: 1,
        windowSec: 60,
        key: ({ shopId }: { shopId: string }) => `shop:${shopId}`,
      },
    })({ shopId: SHOP, name: "Brew" });
    expect(calls).toContain(`rateLimit:action:shop.rename:shop:${SHOP}`); // still namespaced per action
    expect(calls).toContain("audit:shop.rename:in-tx:unknown");
  });
});

describe("[P0-07] defineRoute: same steps for route handlers, plus Origin checks", () => {
  const route = () =>
    defineRoute({
      name: "shop.rename.route",
      input,
      authorize: () => Promise.resolve(scope),
      handler: ({ name }) => Promise.resolve({ renamed: name }),
    });
  const req = (init: RequestInit & { url?: string } = {}) =>
    new Request(init.url ?? "http://localhost:3000/api/x", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ shopId: SHOP, name: "Brew" }),
      ...init,
    });

  it("returns the data as JSON on success", async () => {
    const res = await route()(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { renamed: "Brew" } });
  });

  it("blocks a cross-origin mutation with 403 before doing anything", async () => {
    const res = await route()(
      req({ headers: { origin: "https://evil.example", "content-type": "application/json" } }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(calls).toEqual([]);
  });

  it("maps errors to their status: bad JSON and invalid input → 400, anonymous → 401", async () => {
    expect((await route()(req({ body: "{not json" }))).status).toBe(400);
    expect((await route()(req({ body: JSON.stringify({ shopId: SHOP }) }))).status).toBe(400);
    state.principal = null;
    expect((await route()(req())).status).toBe(401);
  });

  it("a rate-limited route answers 429 with Retry-After", async () => {
    state.rateLimited = true;
    const limited = defineRoute({
      name: "shop.rename.route",
      input,
      authorize: () => Promise.resolve(scope),
      rateLimit: { max: 1, windowSec: 60 },
      handler: () => Promise.resolve("ok"),
    });
    const res = await limited(req());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
  });

  it("[P0-19] refuses a body over the limit with 413 before running anything (declared or streamed)", async () => {
    const big = JSON.stringify({ shopId: SHOP, name: "x".repeat(70 * 1024) });
    const declared = await route()(req({ body: big }));
    expect(declared.status).toBe(413);
    expect(await declared.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });

    // Chunked: no Content-Length, so the limit is enforced while reading.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const chunk = new TextEncoder().encode("x".repeat(16 * 1024));
        for (let i = 0; i < 5; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    const streamed = await route()(
      new Request("http://localhost:3000/api/x", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: stream,
        duplex: "half",
      } as RequestInit),
    );
    expect(streamed.status).toBe(413);
    expect(calls).toEqual([]);

    const roomy = defineRoute({
      name: "shop.rename.route",
      input,
      maxBodyBytes: 128 * 1024,
      authorize: () => Promise.resolve(scope),
      handler: () => Promise.resolve("ok"),
    });
    expect((await roomy(req({ body: big }))).status).toBe(400); // past the size check; then input validation
  });

  it("reads GET input from the query string (no Origin needed for safe methods)", async () => {
    const res = await route()(
      new Request(`http://localhost:3000/api/x?shopId=${SHOP}&name=Brew`, { method: "GET" }),
    );
    expect(await res.json()).toEqual({ data: { renamed: "Brew" } });
  });
});
