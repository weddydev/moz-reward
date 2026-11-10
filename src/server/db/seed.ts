import "../../../scripts/load-env";
import "server-only";
import { isDirectRun } from "@/lib/is-direct-run";
import { env } from "@/server/env";
import { purposeKey } from "@/server/security/keys";
import { FLAGS } from "@/server/services/flags";
import { type Database, dbAs, setDbProcess } from "./client";
import { demoEmailBase, privilegedWithoutTotp, resetDemo, runDemoSeed } from "./demo-seed";
import { contentSettings, featureFlags } from "./schema";

/**
 * `pnpm db:seed` (P0-03): idempotent baseline data every environment except production needs. Inserts only
 * what is missing (ON CONFLICT DO NOTHING), so a re-run never overwrites an admin's changes.
 * Then the demo data (P0-16, `demo-seed.ts`): three shops and one account per role, also idempotent.
 * `pnpm db:seed --reset` (staging: weekly and before each demo) deletes the demo rows first and re-creates
 * them with the same ids, codes and credentials. Sign-in details are never printed here (deploy logs);
 * `pnpm demo:credentials` shows them.
 */

/** PRODUCT.md "Marketplace" categories (10). Admins edit them later in Content settings. */
export const MARKETPLACE_CATEGORIES = [
  "Electronics",
  "Mobiles and tablets",
  "Home and furniture",
  "Fashion",
  "Kids and baby",
  "Sports and outdoors",
  "Books and hobbies",
  "Vehicles and parts",
  "Collectibles",
  "Other",
] as const;

export function seedPlan(): {
  flags: { key: string; enabled: boolean; description: string }[];
  content: { key: string; value: unknown; description: string }[];
} {
  return {
    flags: Object.entries(FLAGS).map(([key, description]) => ({
      key,
      enabled: false,
      description,
    })),
    content: [
      {
        key: "marketplace_categories",
        value: [...MARKETPLACE_CATEGORIES],
        description: "Marketplace listing categories (PRODUCT: Marketplace)",
      },
    ],
  };
}

export function assertSeedAllowed(appEnv: string | undefined): void {
  if (appEnv === "production")
    throw new Error(
      "db:seed never runs in production (demo/baseline data is for local, test and staging).",
    );
}

export async function runSeed(database: Database): Promise<{ flags: number; content: number }> {
  const plan = seedPlan();
  return database.transaction(async (tx) => {
    const flags = await tx
      .insert(featureFlags)
      .values(plan.flags)
      .onConflictDoNothing()
      .returning();
    const content = await tx
      .insert(contentSettings)
      .values(plan.content)
      .onConflictDoNothing()
      .returning();
    return { flags: flags.length, content: content.length };
  });
}

/**
 * C-07 (audit SEC-2): a staff/admin account without TOTP could enrol an authenticator with the password alone.
 * On staging that fails the seed; locally it is a warning (developers create throwaway accounts).
 */
export function assertNoPasswordOnlyStaff(appEnv: string | undefined, emails: string[]): void {
  if (emails.length === 0) return;
  const message = `${String(emails.length)} staff/admin account(s) have no two-step verification: ${emails.join(", ")}`;
  if (appEnv === "staging") throw new Error(`${message}. Remove them or enrol TOTP, then re-run.`);
  console.warn(`[db] warning: ${message}`);
}

async function main(): Promise<void> {
  const appEnv = process.env.APP_ENV;
  assertSeedAllowed(appEnv);
  const reset = process.argv.includes("--reset");
  // SECURITY §3: seeds that cross shops run as moz_worker (DATABASE_URL_WORKER), never as the owner.
  setDbProcess("worker");
  const database = dbAs("system");
  const inserted = await runSeed(database);
  console.warn(
    `[db] seed done: ${String(inserted.flags)} feature flags and ${String(inserted.content)} content settings inserted (existing rows kept)`,
  );

  const emailBase = demoEmailBase(appEnv, env().DEMO_EMAIL_BASE);
  if (reset) {
    const removed = await resetDemo(database);
    console.warn(
      `[db] demo reset: ${String(removed.users)} accounts and ${String(removed.shops)} shops removed`,
    );
  }
  const demo = await runDemoSeed(database, {
    key: purposeKey("demo-seed"),
    emailBase,
    authSecret: env().AUTH_SECRET,
  });
  console.warn(
    `[db] demo seed done: ${String(demo.shops)} shops, ${String(demo.users)} accounts, ${String(demo.staff)} staff, ${String(demo.admins)} admin and ${String(demo.memberships)} membership rows inserted (existing rows kept). Sign-in details: pnpm demo:credentials`,
  );
  assertNoPasswordOnlyStaff(appEnv, await privilegedWithoutTotp(database));
  process.exit(0);
}

if (isDirectRun(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error("[db] seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
