// Deploy env bodies (P0-15 step C). Plain Node, no dependencies: the deploy job runs it without `pnpm install`.
//
//   node scripts/deploy-env.mjs <env> <role>   → stdout: KEY=value lines for `moz-deploy write-env <env> <role>`
//
// Non-secret settings come from the committed infra/deploy/<env>.env; secrets come from this process's
// environment, where the workflow maps only this role's GitHub secrets (`<KEY>_<ENV>`, e.g. AUTH_SECRET_STAGING).
// The root helper appends the host-generated DB/Redis URLs and refuses reserved keys. Errors name keys only,
// never values; nothing is printed except the body on stdout (piped straight into ssh).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROLES = {
  staging: ["web", "worker", "caddy", "cloudflared", "backup"],
  production: ["web", "worker", "caddy", "cloudflared", "umami", "backup"],
};

const APP_CONFIG = [
  "APP_URL",
  "REDIS_KEY_PREFIX",
  "TRUSTED_PROXY",
  "EMAIL_PROVIDER",
  "EMAIL_FALLBACK_PROVIDER",
  "EMAIL_FROM",
  "EMAIL_DAILY_CAP",
  "DATA_ENCRYPTION_KEY_ID",
  "LOG_LEVEL",
];

/** Settings each role takes from infra/deploy/<env>.env (only those present are written). */
const CONFIG_KEYS = {
  web: APP_CONFIG,
  worker: APP_CONFIG,
  caddy: ["APP_HOST", "BASIC_AUTH_USER", "UMAMI_HOST", "MAINTENANCE"],
  cloudflared: [],
  umami: [],
  backup: [],
};

const APP_SECRETS = {
  required: [
    "AUTH_SECRET",
    "DATA_ENCRYPTION_KEY",
    "BLIND_INDEX_KEY",
    "MEMBER_QR_SIGNING_KEY",
    "HEALTH_TOKEN",
    "EMAIL_API_KEY",
    "EMAIL_FALLBACK_API_KEY",
    "TURNSTILE_SECRET_KEY",
    "ALERT_EMAILS",
  ],
  optional: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SENTRY_DSN"],
  stagingRequired: [],
};

/** Secrets per role. `stagingRequired` keys are written on staging only and never on production. */
const SECRET_KEYS = {
  web: APP_SECRETS,
  // The staging release seeds demo accounts in the worker container (C-38).
  worker: { ...APP_SECRETS, stagingRequired: ["DEMO_EMAIL_BASE"] },
  // Bcrypt of the staging basic-auth password, hashed in the job (never the password itself).
  caddy: { required: [], optional: [], stagingRequired: ["BASIC_AUTH_HASH"] },
  cloudflared: { required: ["TUNNEL_TOKEN"], optional: [], stagingRequired: [] },
  umami: { required: ["APP_SECRET"], optional: [], stagingRequired: [] },
  // The B2 key pair of the nightly dumps and wal-g (list + write only, H-42). moz-deploy builds every other
  // backup setting on the host (endpoint, bucket, prefix, key).
  backup: { required: ["B2_KEY_ID", "B2_APP_KEY"], optional: [], stagingRequired: [] },
};

export const ALL_SECRET_KEYS = [
  ...new Set(
    Object.values(SECRET_KEYS).flatMap((r) => [...r.required, ...r.optional, ...r.stagingRequired]),
  ),
];

/**
 * KEY=value lines → Map. Comments and blank lines are skipped; the value is everything after the first `=`.
 * @param {string} text
 * @returns {Map<string, string>}
 */
export function parseConfig(text) {
  /** @type {Map<string, string>} */
  const out = new Map();
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === "" || line.startsWith("#")) return;
    const m = /^([A-Z][A-Z0-9_]{0,63})=(.*)$/.exec(line);
    if (!m) throw new Error(`settings line ${String(i + 1)} is not KEY=value`);
    if (out.has(m[1])) throw new Error(`settings: ${m[1]} appears twice`);
    out.set(m[1], m[2]);
  });
  return out;
}

const UNSAFE = /[\r\n']/;

/**
 * The env body for one role: its settings, then its secrets. Throws naming the GitHub secret, never a value.
 * @param {string} env
 * @param {string} role
 * @param {Map<string, string>} config
 * @param {Readonly<Record<string, string | undefined>>} secrets
 * @returns {string}
 */
export function buildEnv(env, role, config, secrets) {
  if (!Object.hasOwn(ROLES, env)) throw new Error(`unknown environment (staging or production)`);
  if (!Object.hasOwn(SECRET_KEYS, role)) throw new Error(`unknown role`);
  if (!ROLES[env].includes(role)) throw new Error(`${role} runs in production only`);
  const suffix = env.toUpperCase();
  const lines = [];
  for (const key of CONFIG_KEYS[role]) {
    const value = config.get(key);
    if (value === undefined) continue;
    if (UNSAFE.test(value)) throw new Error(`settings: ${key} has a newline or single quote`);
    lines.push(`${key}=${value}`);
  }
  const spec = SECRET_KEYS[role];
  const required = [...spec.required, ...(env === "staging" ? spec.stagingRequired : [])];
  for (const key of [...required, ...spec.optional]) {
    const value = secrets[key] ?? "";
    if (value === "") {
      if (required.includes(key)) throw new Error(`${key}_${suffix} is not set`);
      continue;
    }
    if (UNSAFE.test(value)) throw new Error(`${key}_${suffix} has a newline or single quote`);
    lines.push(`${key}=${value}`);
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const [env, role] = process.argv.slice(2);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  if (!env || !Object.hasOwn(ROLES, env))
    throw new Error("usage: deploy-env.mjs <staging|production> <role>");
  const config = parseConfig(
    readFileSync(path.join(root, "infra", "deploy", `${env}.env`), "utf8"),
  );
  process.stdout.write(buildEnv(env, role, config, process.env));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`deploy-env: ${err instanceof Error ? err.message : "failed"}\n`);
    process.exit(1);
  }
}
