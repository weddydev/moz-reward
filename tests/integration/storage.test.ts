import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureBucket } from "../support/storage";

describe("[P0-17] object storage (S3 provider against MinIO)", () => {
  beforeAll(async () => {
    await ensureBucket();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("stores, reads back and deletes an object", async () => {
    const { storage } = await import("@/server/integrations/storage");
    const key = `test/${randomUUID()}.txt`;
    await storage.put(key, Buffer.from("hello moz"), "text/plain");
    const got = await storage.get(key);
    expect(got?.contentType).toBe("text/plain");
    expect(got?.body.toString()).toBe("hello moz");

    await storage.delete(key);
    await expect(storage.get(key)).resolves.toBeNull();
  });

  it("returns null for a key that does not exist", async () => {
    const { storage } = await import("@/server/integrations/storage");
    await expect(storage.get(`test/${randomUUID()}-missing`)).resolves.toBeNull();
  });

  it("rejects keys that try to escape their prefix", async () => {
    const { storage } = await import("@/server/integrations/storage");
    await expect(storage.put("../etc/passwd", Buffer.from("x"), "text/plain")).rejects.toThrow(
      /invalid storage key/,
    );
    await expect(storage.put("/abs/key", Buffer.from("x"), "text/plain")).rejects.toThrow(
      /invalid storage key/,
    );
  });

  it("fails closed with a clear error when S3 is not configured", async () => {
    vi.stubEnv("S3_BUCKET", "");
    const { storage } = await import("@/server/integrations/storage");
    await expect(storage.get("anything")).rejects.toThrow(/Storage is not configured/);
  });
});
