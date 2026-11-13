// Generated deploy secrets (P0-15; SECURITY §7 inventory). Plain Node, no dependencies.
//
//   node scripts/deploy-secrets.mjs <staging|production>
//
// Creates each generated secret of that environment that GitHub doesn't have yet (`gh secret set <NAME>` with the
// value on stdin; an existing secret is never overwritten, so rotation is a deliberate `gh secret delete` first,
// RUNBOOK §9). The values are never printed: they go to GitHub and, once, to a new 0600 file in the home folder
// for the human to import into the password manager and then delete (HUMAN_TASKS H-41). Provider keys (email,
// Google, Turnstile, Sentry, Tunnel) are made by the human in each provider's console, not here.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENVS = ["staging", "production"];

const base64 = (n) => () => randomBytes(n).toString("base64");
const base64url = (n) => () => randomBytes(n).toString("base64url");
const hex = (n) => () => randomBytes(n).toString("hex");

const COMMON = [
  { key: "AUTH_SECRET", make: base64(48) },
  { key: "DATA_ENCRYPTION_KEY", make: base64(32) },
  { key: "BLIND_INDEX_KEY", make: base64(32) },
  { key: "MEMBER_QR_SIGNING_KEY", make: base64(32) },
  { key: "HEALTH_TOKEN", make: base64url(32) },
  // Migration owner (moz_owner): moz-deploy accepts 24-128 URL-safe characters.
  { key: "DB_OWNER_PASSWORD", make: hex(32) },
];
const ONLY = {
  // Staging basic auth (Caddy stores only its bcrypt hash); URL-safe so the smoke step's netrc can hold it.
  staging: [{ key: "BASIC_AUTH_PASSWORD", make: base64url(24) }],
  production: [{ key: "UMAMI_APP_SECRET", make: hex(32) }],
};

/** @typedef {{ name: string, make: () => string }} SecretSpec */

/**
 * The generated secrets of one environment: GitHub name + generator.
 * @param {string} env
 * @returns {SecretSpec[]}
 */
export function specsFor(env) {
  if (!ENVS.includes(env)) throw new Error("unknown environment (staging or production)");
  const suffix = env.toUpperCase();
  return [...COMMON, ...ONLY[env]].map((s) => ({ name: `${s.key}_${suffix}`, make: s.make }));
}

/** @param {SecretSpec} spec @returns {string} */
export const generate = (spec) => spec.make();

/**
 * Specs whose GitHub secret doesn't exist yet.
 * @param {string} env
 * @param {readonly string[]} existing
 * @returns {SecretSpec[]}
 */
export const missingSecrets = (env, existing) =>
  specsFor(env).filter((s) => !existing.includes(s.name));

function gh(args, input) {
  const r = spawnSync("gh", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  if (r.status !== 0)
    throw new Error(`gh ${args[0]} ${args[1]} failed: ${(r.stderr ?? "").trim().slice(0, 200)}`);
  return r.stdout;
}

function main() {
  const env = process.argv[2] ?? "";
  const existing = JSON.parse(gh(["secret", "list", "--json", "name"])).map((s) => s.name);
  const todo = missingSecrets(env, existing);
  if (todo.length === 0) {
    console.warn(`deploy-secrets: every generated ${env} secret already exists; nothing changed`);
    return;
  }
  const file = path.join(
    homedir(),
    `moz-secrets-${env}-${new Date().toISOString().slice(0, 10)}.env`,
  );
  if (existsSync(file)) throw new Error(`${file} already exists: import it and delete it first`);
  const lines = [`# Moz Rewards ${env}: import into the password manager, then delete this file.`];
  for (const spec of todo) {
    const value = generate(spec);
    gh(["secret", "set", spec.name], value);
    lines.push(`${spec.name}=${value}`);
    console.warn(`deploy-secrets: set ${spec.name}`);
  }
  writeFileSync(file, `${lines.join("\n")}\n`, { mode: 0o600, flag: "wx" });
  console.warn(
    `deploy-secrets: ${String(todo.length)} set; password-manager copy written to ${file}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`deploy-secrets: ${err instanceof Error ? err.message : "failed"}`);
    process.exit(1);
  }
}
