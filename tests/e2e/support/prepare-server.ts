import "../../../scripts/load-env";
import { prepareE2eDatabase } from "../../support/db";
import { ensureBucket } from "../../support/storage";

/** Runs right before Playwright starts the E2E server (never against a server that is already up). */
async function main(): Promise<void> {
  await prepareE2eDatabase();
  await ensureBucket();
  console.warn("[e2e] database migrated and bucket ready");
}

main().catch((err: unknown) => {
  console.error("[e2e] server preparation failed:", err);
  process.exit(1);
});
