/**
 * Live smoke against REAL providers (TESTING §9). Not part of normal CI: run on staging at phase end
 * with `pnpm test:live`. Each provider is skipped (with the reason) until its credentials exist.
 * Uses test data only; never real personal data.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const has = (...keys: string[]): boolean => keys.every((k) => Boolean(process.env[k]));

describe("[P0-17] live provider smoke", () => {
  it.skipIf(!has("S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"))(
    "object storage round-trip",
    async () => {
      const { storage } = await import("@/server/integrations/storage");
      const key = `live-smoke/${randomUUID()}.txt`;
      await storage.put(key, Buffer.from("live smoke"), "text/plain");
      expect((await storage.get(key))?.body.toString()).toBe("live smoke");
      await storage.delete(key);
    },
  );

  it.skipIf(!has("EMAIL_API_KEY", "LIVE_TEST_EMAIL_TO"))(
    "email provider accepts a message",
    async () => {
      const { sendEmail } = await import("@/server/integrations/email");
      await expect(
        sendEmail({
          to: process.env.LIVE_TEST_EMAIL_TO!,
          subject: "Moz Rewards live smoke",
          text: `Live smoke ${new Date().toISOString()}`,
          kind: "live-smoke",
        }),
      ).resolves.toBeUndefined();
    },
  );

  // Push (VAPID), AI (Gemini), postcodes and Places get a live check here when their real providers land.
});
