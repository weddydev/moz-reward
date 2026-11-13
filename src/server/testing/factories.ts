import "server-only";
/**
 * Test data factories (TESTING §6). Used by integration tests and the test-only seeding API
 * (`/api/test/*`, APP_ENV=test only). Every factory builds exactly what it is asked for, with
 * unique, obviously fake data (never real personal data).
 */
import { eq } from "drizzle-orm";
import { withUniqueCode } from "@/lib/codes";
import { newId } from "@/lib/id";
import { hashPassword } from "@/server/auth/password";
import { testOwnerDb as db } from "@/server/db/client";
import {
  accounts,
  adminMembers,
  customerProfiles,
  featureFlags,
  memberships,
  opsSnapshot,
  sessions,
  shopStaff,
  shops,
  users,
} from "@/server/db/schema";
import { QUEUE_NAMES } from "@/server/jobs/registry";
import type { HealthSnapshot } from "@/server/ops/health-rules";

export type UserRow = typeof users.$inferSelect;
export type ShopRow = typeof shops.$inferSelect;
type AdminRole = (typeof adminMembers.$inferInsert)["role"];
type StaffRole = NonNullable<(typeof shopStaff.$inferInsert)["role"]>;

export const TEST_PASSWORD = "correct-horse-battery-staple-42";
const uniq = (): string => newId().slice(-12);

/** Unique, obviously fake email (the `.invalid` TLD can never be delivered). */
export const fakeEmail = (label = "user"): string => `${label}.${uniq()}@test.moz.invalid`;

export async function makeUser(
  over: { email?: string; name?: string; password?: string | null } = {},
): Promise<UserRow> {
  const [user] = await db()
    .insert(users)
    .values({
      email: (over.email ?? fakeEmail()).toLowerCase(),
      name: over.name ?? "Test User",
      emailVerified: true,
    })
    .returning();
  if (!user) throw new Error("makeUser: insert returned no row");
  if (over.password !== null) {
    await db()
      .insert(accounts)
      .values({
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: await hashPassword(over.password ?? TEST_PASSWORD),
      });
  }
  return user;
}

export async function makeCustomerProfile(
  userId: string,
  over: Partial<typeof customerProfiles.$inferInsert> = {},
): Promise<typeof customerProfiles.$inferSelect> {
  return withUniqueCode(
    async (memberId) => {
      const [row] = await db()
        .insert(customerProfiles)
        .values({ userId, fullName: "Aisha Khan", memberId, ...over })
        .returning();
      if (!row) throw new Error("makeCustomerProfile: no row");
      return row;
    },
    { length: 6 },
  );
}

export async function makeShop(over: Partial<typeof shops.$inferInsert> = {}): Promise<ShopRow> {
  return withUniqueCode(
    async (shopCode) => {
      const [row] = await db()
        .insert(shops)
        .values({
          slug: `shop-${uniq()}`,
          shopCode,
          name: "Brew & Bloom Café",
          category: "cafe",
          status: "active",
          ...over,
        })
        .returning();
      if (!row) throw new Error("makeShop: no row");
      return row;
    },
    { length: 6 },
  );
}

export async function makeStaff(
  shopId: string,
  userId: string,
  role: StaffRole = "staff",
  over: Partial<typeof shopStaff.$inferInsert> = {},
): Promise<typeof shopStaff.$inferSelect> {
  const [row] = await db()
    .insert(shopStaff)
    .values({ shopId, userId, role, perAwardLimit: role === "staff" ? 200 : null, ...over })
    .returning();
  if (!row) throw new Error("makeStaff: no row");
  return row;
}

export async function makeAdmin(
  userId: string,
  role: AdminRole,
  over: Partial<typeof adminMembers.$inferInsert> = {},
): Promise<typeof adminMembers.$inferSelect> {
  const [row] = await db()
    .insert(adminMembers)
    .values({ userId, role, ...over })
    .returning();
  if (!row) throw new Error("makeAdmin: no row");
  return row;
}

export async function makeMembership(
  userId: string,
  shopId: string,
  over: Partial<typeof memberships.$inferInsert> = {},
): Promise<typeof memberships.$inferSelect> {
  const [row] = await db()
    .insert(memberships)
    .values({ userId, shopId, ...over })
    .returning();
  if (!row) throw new Error("makeMembership: no row");
  return row;
}

export async function makeFeatureFlag(
  key: string,
  enabled = false,
): Promise<typeof featureFlags.$inferSelect> {
  const [row] = await db().insert(featureFlags).values({ key, enabled }).returning();
  if (!row) throw new Error("makeFeatureFlag: no row");
  return row;
}

export const ACTOR_ROLES = [
  "customer",
  "staff",
  "owner",
  "admin_owner",
  "admin_support",
  "admin_moderator",
  "admin_finance",
] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

/** Builds a ready-to-use actor for a role: user (+ profile/shop/staff/admin rows as needed). */
export async function makeActor(
  role: ActorRole,
  opts: { shopId?: string } = {},
): Promise<{ user: UserRow; shopId: string | null; shopCode: string | null }> {
  const user = await makeUser({
    email: fakeEmail(role),
    name: `Test ${role}`,
    password: role === "customer" ? null : TEST_PASSWORD,
  });
  switch (role) {
    case "customer":
      await makeCustomerProfile(user.id);
      return { user, shopId: null, shopCode: null };
    case "staff":
    case "owner": {
      // shopCode is known only for a shop created here (null when the caller passed shopId).
      const shop = opts.shopId ? null : await makeShop();
      const shopId = opts.shopId ?? shop?.id ?? "";
      await makeStaff(shopId, user.id, role);
      return { user, shopId, shopCode: shop?.shopCode ?? null };
    }
    case "admin_owner":
    case "admin_support":
    case "admin_moderator":
    case "admin_finance":
      await makeAdmin(user.id, role.slice("admin_".length) as AdminRole);
      return { user, shopId: null, shopCode: null };
    default: {
      const unreachable: never = role;
      throw new Error(`Unknown role ${String(unreachable)}`);
    }
  }
}

/**
 * Marks a test session as MFA-verified, exactly like a real TOTP sign-in would. The session create hook in
 * auth.ts keeps forcing mfaVerified=false for any non-MFA path, so production can never be tricked into it;
 * only the 404-gated test API calls this.
 */
export async function markSessionMfaVerified(token: string): Promise<void> {
  await db().update(sessions).set({ mfaVerified: true }).where(eq(sessions.token, token));
}

/**
 * Moves a user's sessions back in time (P0-19 conformance): `createdAgoMs` sets the sign-in moment (role
 * limits are absolute from it); `expiresInMs` sets the row's expiry (customer idle limit, refresh window).
 */
export async function ageUserSessions(
  userId: string,
  opts: { createdAgoMs?: number | undefined; expiresInMs?: number | undefined },
): Promise<void> {
  const now = Date.now();
  await db()
    .update(sessions)
    .set({
      ...(opts.createdAgoMs === undefined ? {} : { createdAt: new Date(now - opts.createdAgoMs) }),
      ...(opts.expiresInMs === undefined ? {} : { expiresAt: new Date(now + opts.expiresInMs) }),
    })
    .where(eq(sessions.userId, userId));
}

/** The client addresses recorded on a user's sessions (P0-19 conformance: the proxy's, never a spoofed one). */
export async function userSessionIps(userId: string): Promise<Array<string | null>> {
  const rows = await db()
    .select({ ip: sessions.ipAddress })
    .from(sessions)
    .where(eq(sessions.userId, userId));
  return rows.map((r) => r.ip);
}

/**
 * P0-13: a realistic health snapshot for the System page in E2E (the web process has no worker pool, so the
 * monitor itself can't run there; integration tests cover the real tick).
 */
export async function makeOpsSnapshot(now = new Date()): Promise<HealthSnapshot> {
  const ago = (sec: number): string => new Date(now.getTime() - sec * 1000).toISOString();
  const snapshot: HealthSnapshot = {
    takenAt: now.toISOString(),
    db: { ok: true, ms: 4, sizeBytes: 48 * 1024 * 1024 },
    redis: { ok: true, ms: 1 },
    cache: { ok: true, ms: 1 },
    scheduler: { lastRunAt: ago(25), uptimeSec: 3600 },
    queues: QUEUE_NAMES.map((name) => ({
      name,
      waiting: name === "email" ? 3 : 0,
      active: name === "email" ? 1 : 0,
      delayed: 0,
      failed: 0,
      lagSec: name === "email" ? 75 : 0,
    })),
    outbox: { pending: 2, oldestAgeSec: 14 },
    failedJobs: { unresolved: 1, recent: 0 },
    disk: { path: "/", usedPct: 41 },
    backups: {
      enabled: false,
      lastDumpAt: null,
      lastWalAt: null,
      lastRestoreDrillAt: null,
      lastDumpFailedAt: null,
      lastRestoreDrillFailedAt: null,
    },
    email: { sentToday: 12, cap: 400 },
    sentry: { sentThisMonth: 3, quota: 5000 },
    sse: { connections: null },
  };
  await db()
    .insert(opsSnapshot)
    .values({ id: 1, takenAt: now, data: snapshot })
    .onConflictDoUpdate({ target: opsSnapshot.id, set: { takenAt: now, data: snapshot } });
  return snapshot;
}
