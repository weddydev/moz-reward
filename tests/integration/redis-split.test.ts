import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it, vi } from "vitest";
import { redisFacts, redisPairProblem } from "@/server/boot";
import { cached, cacheKey, cacheRedis, closeCache } from "@/server/cache";
import { createRedis } from "@/server/jobs/connection";
import { enqueue, getQueue } from "@/server/jobs/queues";
import { limiterKey, limiterRedis } from "@/server/security/rate-limit";

const down = new Redis("redis://127.0.0.1:1", {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});
const producer = createRedis("producer");

afterAll(async () => {
  down.disconnect();
  await producer.quit();
  await closeCache();
});

const policy = async (r: Redis): Promise<string | undefined> =>
  (await r.config("GET", "maxmemory-policy"))[1];
const runId = async (r: Redis): Promise<string | undefined> =>
  /run_id:(\w+)/.exec(await r.info("server"))?.[1];

describe("[P0-18] Redis split: queue and limiter never share an instance with the cache (AC3)", () => {
  it("the boot check reads both servers and accepts the real pair; one server twice is refused", async () => {
    const queue = await redisFacts(limiterRedis());
    const cache = await redisFacts(cacheRedis());
    expect(queue.policy).toBe("noeviction");
    expect(redisPairProblem(queue, cache)).toBeNull();
    // A second connection to the queue server posing as the cache (e.g. another db number).
    const sameServer = createRedis("worker");
    try {
      expect(redisPairProblem(queue, await redisFacts(sameServer))).toMatch(/same Redis server/);
    } finally {
      sameServer.disconnect();
    }
  });

  it("queue + limiter run on a noeviction instance; the cache on a separate allkeys-lru one", async () => {
    expect(await policy(limiterRedis())).toBe("noeviction");
    expect(await policy(producer)).toBe("noeviction");
    expect(await policy(cacheRedis())).toBe("allkeys-lru");
    expect(await runId(cacheRedis())).not.toBe(await runId(limiterRedis()));
  });

  it("filling redis-cache to maxmemory evicts cache entries only; queue and limiter keys survive", async () => {
    const cache = cacheRedis();
    const limiterProbe = limiterKey(`split-probe:${randomUUID()}`);
    await limiterRedis().set(limiterProbe, "1", "EX", 300);
    const jobId = `split-probe-${randomUUID()}`;
    await enqueue("scheduled", "heartbeat", {}, { jobId, delay: 60_000 });

    const before = Number(/evicted_keys:(\d+)/.exec(await cache.info("stats"))?.[1] ?? 0);
    const original = (await cache.config("GET", "maxmemory"))[1] ?? "64mb";
    await cache.config("SET", "maxmemory", "4mb");
    try {
      const blob = "x".repeat(8 * 1024);
      // 12 MB in batches of 100 keys (0.8 MB): one pipeline of all 1,500 ran into the cache client's 250ms
      // command timeout on a busy machine (Windows laptop, full parallel run).
      for (let start = 0; start < 1500; start += 100) {
        const pipeline = cache.pipeline();
        for (let i = start; i < start + 100; i++)
          pipeline.set(cacheKey(`fill:${String(i)}`), blob, "EX", 60);
        await pipeline.exec();
      }
      const after = Number(/evicted_keys:(\d+)/.exec(await cache.info("stats"))?.[1] ?? 0);
      expect(after).toBeGreaterThan(before); // the cache really was full and evicted
    } finally {
      await cache.config("SET", "maxmemory", original);
    }
    expect(await limiterRedis().get(limiterProbe)).toBe("1");
    expect(await (await getQueue("scheduled").getJob(jobId))?.getState()).toBe("delayed");
    await (await getQueue("scheduled").getJob(jobId))?.remove();
  });
});

describe("[P0-18] cached(): public reads fail open (SECURITY §6, ARCHITECTURE §5)", () => {
  it("serves from the cache within the TTL", async () => {
    const key = `probe:${randomUUID()}`;
    const loader = vi.fn(() => Promise.resolve({ name: "Brew" }));
    expect(await cached(key, 60, loader)).toEqual({ name: "Brew" });
    await vi.waitFor(async () => {
      expect(await cacheRedis().exists(cacheKey(key))).toBe(1);
    });
    expect(await cached(key, 60, loader)).toEqual({ name: "Brew" });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("Redis down: the loader answers, nothing throws", async () => {
    const loader = vi.fn(() => Promise.resolve(42));
    expect(await cached(`probe:${randomUUID()}`, 60, loader, down)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
