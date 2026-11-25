import { expect, test, testApiHeaders } from "./support/test";
import type { APIRequestContext } from "@playwright/test";

/**
 * P1-10 realtime on the production build. The E2E server runs no worker, so `/api/test/realtime-publish` does
 * the worker's publish step (deliverRealtime); the outbox → worker → Redis leg is proven by
 * tests/integration/worker-process.test.ts with the real worker process.
 */
test.use({ realtime: true });

const streamsOf = async (request: APIRequestContext, userId: string): Promise<number> => {
  const res = await request.get(`/api/test/realtime-stats?userId=${userId}`, {
    headers: testApiHeaders(),
  });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { forUser: number }).forUser;
};

test("[P1-10] two tabs: an event published for the customer arrives in both, live", async ({
  page,
  signInAs,
  shoot,
}) => {
  const me = await signInAs("customer");
  await page.goto("/wallet");
  const second = await page.context().newPage();
  await second.goto("/wallet");
  for (const p of [page, second]) {
    await expect(p.getByTestId("realtime")).toHaveAttribute("data-realtime", "open");
    await expect(p.getByTestId("realtime")).toHaveAttribute("data-realtime-events", "0");
  }

  const res = await page.request.post("/api/test/realtime-publish", {
    data: { userId: me.userId },
    headers: testApiHeaders(),
  });
  expect(res.status()).toBe(200);
  expect(((await res.json()) as { receivers: number }).receivers).toBeGreaterThanOrEqual(1);

  for (const p of [page, second]) {
    await expect(p.getByTestId("realtime")).toHaveAttribute("data-realtime-events", "1");
    await expect(p.getByTestId("realtime")).toHaveAttribute("data-realtime", "open");
  }
  await shoot("two-tabs-event-received");
  await second.close();
});

test("[P1-10] the stream answers like an API: 401 signed out, 403 for another shop's stream or a foreign origin", async ({
  page,
  signInAs,
}) => {
  expect((await page.request.get("/api/sse/me")).status()).toBe(401);
  const owner = await signInAs("owner");
  const other = await page.request.post("/api/test/shop", {
    data: { name: "Realtime other shop", status: "active" },
    headers: testApiHeaders(),
  });
  expect(other.status()).toBe(200);
  const { shopId } = (await other.json()) as { shopId: string };
  const cross = await page.request.get(`/api/sse/shop/${shopId}`);
  expect(cross.status()).toBe(403);
  const foreign = await page.request.get(`/api/sse/shop/${String(owner.shopId)}`, {
    headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
  });
  expect(foreign.status()).toBe(403);
});

test("[P1-10] real sockets: connect/abort cycles leave no stream open on the server", async ({
  page,
  signInAs,
}) => {
  const me = await signInAs("customer");
  await page.goto("/me");
  // The page's own stream (the customer layout holds one).
  await expect(page.getByTestId("realtime")).toHaveAttribute("data-realtime", "open");
  const before = await streamsOf(page.request, me.userId);
  expect(before).toBe(1);
  // Connects under the per-user connect limit (30 / 5 min); each read the first bytes, then drops the socket.
  const opened = await page.evaluate(async () => {
    let ok = 0;
    for (let i = 0; i < 20; i++) {
      const ac = new AbortController();
      const res = await fetch("/api/sse/me", { signal: ac.signal, cache: "no-store" });
      if (res.status === 200 && res.body) {
        const reader = res.body.getReader();
        await reader.read();
        ok++;
      }
      ac.abort();
    }
    return ok;
  });
  expect(opened).toBe(20);
  await expect.poll(() => streamsOf(page.request, me.userId), { timeout: 10_000 }).toBe(1);
});
