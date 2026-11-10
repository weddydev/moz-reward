import "server-only";
import { createHmac, hkdfSync } from "node:crypto";
import { symmetricEncrypt } from "better-auth/crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { LngLat } from "@/lib/geo";
import { hashPassword } from "@/server/auth/password";
import {
  accounts,
  adminMembers,
  customerProfiles,
  memberships,
  shopStaff,
  shops,
  twoFactors,
  users,
} from "./schema";
import type { Database } from "./client";

/**
 * Demo data (P0-16, TESTING §6): the three demo shops and one account per role, for local work and staging.
 *
 * - **Idempotent.** Rows have fixed ids and are inserted with ON CONFLICT DO NOTHING, so a re-run adds only
 *   what is missing and never overwrites a change made during a demo. `--reset` deletes the demo rows first.
 * - **No credential is stored or committed.** Passwords and TOTP secrets are derived (HKDF) from the
 *   environment's own key (`purposeKey("demo-seed")`), so each environment has different ones, a reset keeps
 *   them (authenticator apps keep working), and `pnpm demo:credentials` can show them again.
 * - **Staff and admins are pre-enrolled with TOTP** (C-07, audit SEC-2): with two-step verification already
 *   on, the password alone gives no session, so nobody holding just a demo password can enrol their own app.
 *
 * Later phases add their own demo data here (ledger history, offers, listings…) as those tables arrive.
 */

type AdminRole = (typeof adminMembers.$inferInsert)["role"];

export type DemoShop = {
  id: string;
  slug: string;
  shopCode: string;
  name: string;
  category: string;
  description: string;
  addressLine1: string;
  town: string;
  postcode: string;
  location: LngLat;
};

/** Invented addresses in real towns (never a real business's details). */
export const DEMO_SHOPS = [
  {
    id: "0199d3e0-0000-7000-8000-000000000011",
    slug: "brew-and-bloom-cafe",
    shopCode: "BREW22",
    name: "Brew & Bloom Café",
    category: "cafe",
    description: "Speciality coffee, fresh bakes and flowers by the canal.",
    addressLine1: "12 Lockside Walk",
    town: "Camden",
    postcode: "NW1 8AA",
    location: { lng: -0.1426, lat: 51.539 },
  },
  {
    id: "0199d3e0-0000-7000-8000-000000000012",
    slug: "patels-corner-store",
    shopCode: "PATE22",
    name: "Patel's Corner Store",
    category: "convenience",
    description: "Your everyday essentials, open early till late.",
    addressLine1: "48 Granby Row",
    town: "Leicester",
    postcode: "LE1 6AA",
    location: { lng: -1.1332, lat: 52.6344 },
  },
  {
    id: "0199d3e0-0000-7000-8000-000000000013",
    slug: "glow-studio",
    shopCode: "GKQW22",
    name: "Glow Studio",
    category: "beauty",
    description: "Skin, brows and nails in the Northern Quarter.",
    addressLine1: "7 Tib Yard",
    town: "Manchester",
    postcode: "M4 1AA",
    location: { lng: -2.2361, lat: 53.4839 },
  },
] as const satisfies readonly DemoShop[];

type DemoAccount = {
  key: string;
  id: string;
  name: string;
  /** Shown by `pnpm demo:credentials`. */
  label: string;
  memberId?: string;
  staff?: { shopId: string; role: "owner" | "staff" };
  admin?: AdminRole;
};

const BREW = DEMO_SHOPS[0].id;

/** One account per role. Staff and owner belong to Brew & Bloom Café. Names are invented. */
export const DEMO_ACCOUNTS = [
  {
    key: "customer",
    id: "0199d3e0-0000-7000-8000-000000000001",
    name: "Aisha Khan",
    label: "Customer (email link)",
    memberId: "DEMQ22",
  },
  {
    key: "staff",
    id: "0199d3e0-0000-7000-8000-000000000002",
    name: "Tom Reed",
    label: "Shop staff, Brew & Bloom Café",
    staff: { shopId: BREW, role: "staff" },
  },
  {
    key: "owner",
    id: "0199d3e0-0000-7000-8000-000000000003",
    name: "Maya Bloom",
    label: "Shop owner, Brew & Bloom Café",
    staff: { shopId: BREW, role: "owner" },
  },
  {
    key: "admin-owner",
    id: "0199d3e0-0000-7000-8000-000000000004",
    name: "Demo Admin (owner)",
    label: "Admin: owner",
    admin: "owner",
  },
  {
    key: "admin-support",
    id: "0199d3e0-0000-7000-8000-000000000005",
    name: "Demo Admin (support)",
    label: "Admin: support",
    admin: "support",
  },
  {
    key: "admin-moderator",
    id: "0199d3e0-0000-7000-8000-000000000006",
    name: "Demo Admin (moderator)",
    label: "Admin: moderator",
    admin: "moderator",
  },
  {
    key: "admin-finance",
    id: "0199d3e0-0000-7000-8000-000000000007",
    name: "Demo Admin (finance)",
    label: "Admin: finance",
    admin: "finance",
  },
] as const satisfies readonly DemoAccount[];
/** The same list with every optional field visible (the literal type hides fields an entry doesn't have). */
const ACCOUNTS: readonly DemoAccount[] = DEMO_ACCOUNTS;

const LOCAL_EMAIL_BASE = "demo@mozrewards.test";
const EMAIL_BASE = /^[^\s@+]+@[^\s@+]+\.[^\s@+]+$/;

/**
 * The one inbox every demo address plus-addresses (`DEMO_EMAIL_BASE`). Locally it defaults to an address only
 * Mailpit can receive; staging must name a real inbox the developers control, because the customer signs in
 * by email link and lockout notices are sent to these addresses.
 */
export function demoEmailBase(appEnv: string | undefined, configured: string | undefined): string {
  if (configured === undefined) {
    if (appEnv === "local" || appEnv === "test") return LOCAL_EMAIL_BASE;
    throw new Error(
      "DEMO_EMAIL_BASE is not set: outside local/test the demo accounts need a real inbox (e.g. team@your-domain).",
    );
  }
  if (!EMAIL_BASE.test(configured)) {
    throw new Error("DEMO_EMAIL_BASE must be one plain email address without a + part.");
  }
  return configured;
}

export function demoEmail(base: string, key: string): string {
  const [local, domain] = base.toLowerCase().split("@");
  return `${local ?? ""}+moz-${key}@${domain ?? ""}`;
}

const derive = (key: Buffer, label: string, bytes: number): string =>
  Buffer.from(hkdfSync("sha256", key, "moz-rewards/demo/v1", label, bytes)).toString("base64url");

export type DemoCredential = {
  key: string;
  label: string;
  email: string;
  /** null for the customer: customers have no password (email link / Google). */
  password: string | null;
  /** The raw TOTP secret as Better Auth stores it (before encryption); null for the customer. */
  totpSecret: string | null;
};

/** Every demo account's sign-in details, derived from `key` (the environment's `demo-seed` purpose key). */
export function demoCredentials(key: Buffer, emailBase: string): DemoCredential[] {
  return DEMO_ACCOUNTS.map((account) => {
    const privileged = account.key !== "customer";
    return {
      key: account.key,
      label: account.label,
      email: demoEmail(emailBase, account.key),
      password: privileged ? derive(key, `password:${account.key}`, 18) : null,
      totpSecret: privileged ? derive(key, `totp:${account.key}`, 24) : null,
    };
  });
}

const TOTP_PERIOD_MS = 30_000;

/** RFC 6238 code (SHA-1, 6 digits, 30 s) over the secret's UTF-8 bytes: what Better Auth's verify-totp checks. */
export function totpCode(secret: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / TOTP_PERIOD_MS)));
  const mac = createHmac("sha1", Buffer.from(secret, "utf8")).update(counter).digest();
  const offset = (mac.at(-1) ?? 0) & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(bytes: Buffer): string {
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    out += BASE32.charAt(parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2));
  }
  return out;
}

/** The secret as an authenticator app wants it typed in (base32). */
export const totpSetupKey = (secret: string): string => base32(Buffer.from(secret, "utf8"));

/** `otpauth://` URI for an authenticator app (QR code or paste). */
export function totpUri(secret: string, email: string): string {
  const label = encodeURIComponent(`Moz Rewards:${email}`);
  const params = new URLSearchParams({
    secret: totpSetupKey(secret),
    issuer: "Moz Rewards",
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export type DemoSeedConfig = {
  /** `purposeKey("demo-seed")`. */
  key: Buffer;
  emailBase: string;
  /** AUTH_SECRET: Better Auth decrypts stored TOTP secrets with it. */
  authSecret: string;
};

export type DemoSeedResult = {
  users: number;
  shops: number;
  staff: number;
  admins: number;
  memberships: number;
};

/**
 * Inserts whatever demo rows are missing, in one transaction. A demo email or shop code already used by a
 * non-demo row is a unique violation: the seed stops and changes nothing (never silently skips an account).
 */
export async function runDemoSeed(
  database: Database,
  config: DemoSeedConfig,
): Promise<DemoSeedResult> {
  const credentials = demoCredentials(config.key, config.emailBase);
  // Hashing and encryption happen before the transaction (Argon2 is slow by design).
  const prepared = await Promise.all(
    ACCOUNTS.map(async (account, i) => {
      const credential = credentials[i];
      if (!credential) throw new Error(`no credential for demo account ${account.key}`);
      const { password, totpSecret } = credential;
      return {
        account,
        email: credential.email,
        passwordHash: password === null ? null : await hashPassword(password),
        totp:
          totpSecret === null
            ? null
            : {
                secret: await symmetricEncrypt({ key: config.authSecret, data: totpSecret }),
                // Demo accounts get no backup codes: one secret fewer to share, and the TOTP can be re-derived.
                backupCodes: await symmetricEncrypt({ key: config.authSecret, data: "[]" }),
              },
      };
    }),
  );

  return database.transaction(async (tx) => {
    const result: DemoSeedResult = { users: 0, shops: 0, staff: 0, admins: 0, memberships: 0 };

    const insertedShops = await tx
      .insert(shops)
      .values(DEMO_SHOPS.map((shop) => ({ ...shop, status: "active" as const })))
      .onConflictDoNothing({ target: shops.id })
      .returning({ id: shops.id });
    result.shops = insertedShops.length;

    for (const { account, email, passwordHash, totp } of prepared) {
      const [created] = await tx
        .insert(users)
        .values({
          id: account.id,
          name: account.name,
          email,
          emailVerified: true,
          twoFactorEnabled: totp !== null,
        })
        .onConflictDoNothing({ target: users.id })
        .returning({ id: users.id });
      if (created) {
        // Credentials are written only with the user row: a re-run never resets a changed password.
        result.users += 1;
        if (passwordHash !== null) {
          await tx.insert(accounts).values({
            userId: account.id,
            providerId: "credential",
            accountId: account.id,
            password: passwordHash,
          });
        }
        if (totp !== null) {
          await tx.insert(twoFactors).values({ userId: account.id, ...totp, verified: true });
        }
        if (account.memberId) {
          await tx.insert(customerProfiles).values({
            userId: account.id,
            fullName: account.name,
            memberId: account.memberId,
            isAdultConfirmed: true,
            adultConfirmedAt: new Date(),
          });
        }
      }
      if (account.staff) {
        const rows = await tx
          .insert(shopStaff)
          .values({
            shopId: account.staff.shopId,
            userId: account.id,
            role: account.staff.role,
            perAwardLimit: account.staff.role === "staff" ? 200 : null,
          })
          .onConflictDoNothing()
          .returning({ id: shopStaff.id });
        result.staff += rows.length;
      }
      if (account.admin) {
        const rows = await tx
          .insert(adminMembers)
          .values({ userId: account.id, role: account.admin })
          .onConflictDoNothing()
          .returning({ userId: adminMembers.userId });
        result.admins += rows.length;
      }
      if (account.memberId) {
        // The customer is a member of all three shops; marketing consent stays "not asked" (PECR).
        const rows = await tx
          .insert(memberships)
          .values(DEMO_SHOPS.map((shop) => ({ userId: account.id, shopId: shop.id })))
          .onConflictDoNothing()
          .returning({ id: memberships.id });
        result.memberships += rows.length;
      }
    }
    return result;
  });
}

/** `--reset`: deletes the demo accounts and shops (and, by cascade, everything that hangs off them). */
export async function resetDemo(database: Database): Promise<{ users: number; shops: number }> {
  return database.transaction(async (tx) => {
    const removedUsers = await tx
      .delete(users)
      .where(
        inArray(
          users.id,
          DEMO_ACCOUNTS.map((a) => a.id),
        ),
      )
      .returning({ id: users.id });
    const removedShops = await tx
      .delete(shops)
      .where(
        inArray(
          shops.id,
          DEMO_SHOPS.map((s) => s.id),
        ),
      )
      .returning({ id: shops.id });
    return { users: removedUsers.length, shops: removedShops.length };
  });
}

/**
 * Emails of active staff/admin accounts without a verified TOTP (C-07): such an account could enrol an
 * authenticator with the password alone. The seed refuses to finish on staging while any exists.
 */
export async function privilegedWithoutTotp(database: Database): Promise<string[]> {
  const privileged = sql`(
    EXISTS (SELECT 1 FROM ${shopStaff} WHERE ${shopStaff.userId} = ${users.id} AND ${shopStaff.active})
    OR EXISTS (SELECT 1 FROM ${adminMembers} WHERE ${adminMembers.userId} = ${users.id} AND ${adminMembers.active})
  )`;
  const rows = await database
    .selectDistinct({ email: users.email })
    .from(users)
    .leftJoin(twoFactors, and(eq(twoFactors.userId, users.id), eq(twoFactors.verified, true)))
    .where(and(privileged, or(eq(users.twoFactorEnabled, false), isNull(twoFactors.id))))
    .orderBy(users.email);
  return rows.map((r) => r.email);
}
