import "../../../scripts/load-env";
import "server-only";
import { isDirectRun } from "@/lib/is-direct-run";
import { FLAGS } from "@/server/services/flags";
import { type Database, db } from "./client";
import { contentSettings, featureFlags } from "./schema";

/**
 * `pnpm db:seed` (P0-03): idempotent baseline data every environment except production needs. Inserts only
 * what is missing (ON CONFLICT DO NOTHING), so a re-run never overwrites an admin's changes.
 * P0-16 extends this with the demo shops and one account per role (TESTING §6).
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

async function main(): Promise<void> {
  assertSeedAllowed(process.env.APP_ENV);
  const inserted = await runSeed(db());
  console.warn(
    `[db] seed done: ${String(inserted.flags)} feature flags and ${String(inserted.content)} content settings inserted (existing rows kept)`,
  );
  process.exit(0);
}

if (isDirectRun(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error("[db] seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
