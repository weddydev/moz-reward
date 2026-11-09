import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mintAdminScope } from "@/server/authz/scope";
import { db } from "@/server/db/client";
import { featureFlags } from "@/server/db/schema";
import { FLAGS, isEnabled, setFlag } from "@/server/services/flags";
import { makeAdmin, makeUser } from "../fixtures/factories";

const KEY = "game_rewards";

async function adminScope() {
  const user = await makeUser();
  await makeAdmin(user.id, "owner");
  return mintAdminScope({ userId: user.id, role: "owner" });
}

describe("[P0-14] feature flags service against the real DB", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off when no row exists and no override is set", async () => {
    await db().delete(featureFlags).where(eq(featureFlags.key, KEY));
    expect(await isEnabled(KEY)).toBe(false);
  });

  it("setFlag creates, then updates, the row with its description and the admin who changed it", async () => {
    await db().delete(featureFlags).where(eq(featureFlags.key, KEY));
    const scope = await adminScope();

    expect(await setFlag(scope, { key: KEY, enabled: true })).toEqual({ key: KEY, enabled: true });
    expect(await isEnabled(KEY)).toBe(true);

    const other = await adminScope();
    await setFlag(other, { key: KEY, enabled: false });
    expect(await isEnabled(KEY)).toBe(false);

    const rows = await db().select().from(featureFlags).where(eq(featureFlags.key, KEY));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      enabled: false,
      description: FLAGS[KEY],
      updatedBy: other.userId,
    });
  });

  it("an env override wins over the DB in both directions", async () => {
    const scope = await adminScope();
    await setFlag(scope, { key: KEY, enabled: true });
    vi.stubEnv("FLAG_GAME_REWARDS", "off");
    expect(await isEnabled(KEY)).toBe(false);

    await setFlag(scope, { key: KEY, enabled: false });
    vi.stubEnv("FLAG_GAME_REWARDS", "on");
    expect(await isEnabled(KEY)).toBe(true);
  });
});
