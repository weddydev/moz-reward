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
import { db } from "@/server/db/client";
import {
  accounts,
  adminMembers,
  customerProfiles,
  featureFlags,
  memberships,
  sessions,
  shopStaff,
  shops,
  users,
} from "@/server/db/schema";

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
): Promise<{ user: UserRow; shopId: string | null }> {
  const user = await makeUser({
    email: fakeEmail(role),
    name: `Test ${role}`,
    password: role === "customer" ? null : TEST_PASSWORD,
  });
  switch (role) {
    case "customer":
      await makeCustomerProfile(user.id);
      return { user, shopId: null };
    case "staff":
    case "owner": {
      const shopId = opts.shopId ?? (await makeShop()).id;
      await makeStaff(shopId, user.id, role);
      return { user, shopId };
    }
    case "admin_owner":
    case "admin_support":
    case "admin_moderator":
    case "admin_finance":
      await makeAdmin(user.id, role.slice("admin_".length) as AdminRole);
      return { user, shopId: null };
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
