/**
 * `pnpm demo:credentials` (P0-16): prints the demo accounts' sign-in details for THIS environment.
 * Nothing is stored: passwords and TOTP secrets are derived from the environment's own key, so the output is
 * the same after every `pnpm db:seed --reset`. Run it in a terminal you trust; on staging, copy the output
 * into the password manager (HUMAN_TASKS H-36) and never into a chat, a ticket or a commit.
 * `--codes` prints only the current 6-digit codes (handy locally instead of an authenticator app).
 */
import "./load-env";
import {
  demoCredentials,
  demoEmailBase,
  totpCode,
  totpSetupKey,
  totpUri,
} from "@/server/db/demo-seed";
import { assertSeedAllowed } from "@/server/db/seed";
import { env } from "@/server/env";
import { purposeKey } from "@/server/security/keys";

function main(): void {
  const appEnv = process.env.APP_ENV;
  assertSeedAllowed(appEnv);
  const codesOnly = process.argv.includes("--codes");
  const credentials = demoCredentials(
    purposeKey("demo-seed"),
    demoEmailBase(appEnv, env().DEMO_EMAIL_BASE),
  );
  const lines: string[] = [`Moz Rewards demo accounts (${appEnv ?? "unknown"})`, ""];
  for (const c of credentials) {
    if (codesOnly) {
      if (c.totpSecret) lines.push(`${c.key.padEnd(16)} ${totpCode(c.totpSecret)}`);
      continue;
    }
    lines.push(c.label, `  email     ${c.email}`);
    if (c.password === null || c.totpSecret === null) {
      lines.push("  sign in   email link (local: Mailpit, http://localhost:8025)", "");
      continue;
    }
    lines.push(
      `  password  ${c.password}`,
      `  TOTP key  ${totpSetupKey(c.totpSecret)}`,
      `  TOTP URI  ${totpUri(c.totpSecret, c.email)}`,
      `  code now  ${totpCode(c.totpSecret)}`,
      "",
    );
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

try {
  main();
} catch (err: unknown) {
  console.error("[demo] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
