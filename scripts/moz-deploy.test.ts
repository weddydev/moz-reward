import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findBash } from "./lib/find-bash";

/**
 * P0-15 B2: the root helper `infra/host/moz-deploy` is the only thing CI can run on the VPS (forced command →
 * sudo, request in SSH_ORIGINAL_COMMAND). These tests source it in bash and drive its pure functions: request
 * validation (the allowlist) and env-file rendering (what a caller may put in a root-only env file).
 */
const root = path.resolve(import.meta.dirname, "..");
const helper = path
  .resolve(import.meta.dirname, "..", "infra", "host", "moz-deploy")
  .replaceAll("\\", "/");

const bash = findBash();

type Run = { status: number | null; stdout: string; stderr: string };
function run(script: string, args: string[], input = ""): Run {
  const result = spawnSync(bash, ["-c", `source "$1"; shift; ${script}`, "_", helper, ...args], {
    input,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const check = (mode: "ci" | "admin", request: string): Run =>
  run('check_request "$1" "$2"; printf "%s\\n" "${REQ[@]}"', [mode, request]);

const render = (env: string, role: string, input: string): Run =>
  run('render_env "$1" "$2"', [env, role], input);

const SHA = "0123456789abcdef0123456789abcdef01234567";
const EX_USAGE = 64;
const EX_INPUT = 65;

describe("[P0-15] moz-deploy request validation", () => {
  it.each([
    `load staging ${SHA}`,
    `load production ${SHA}`,
    `release staging ${SHA}`,
    `release production ${SHA}`,
    "rollback staging",
    "rollback production",
    "write-env staging web",
    "write-env staging worker",
    "write-env staging caddy",
    "write-env staging cloudflared",
    "write-env production umami",
  ])("[P0-15] CI may run %s", (request) => {
    const result = check("ci", request);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual(request.split(" "));
  });

  it.each([
    ["", "empty request"],
    ["init-env staging", "developer-only command"],
    ["bootstrap-db production", "developer-only command"],
    ["status staging", "developer-only command"],
    ["deploy staging", "unknown command"],
    [`release dev ${SHA}`, "unknown environment"],
    [`release staging ${SHA.toUpperCase()}`, "upper-case SHA"],
    [`release staging ${SHA.slice(1)}`, "39-character SHA"],
    [`release staging ${SHA}0`, "41-character SHA"],
    [`release staging ${SHA} extra`, "extra argument"],
    ["release staging", "missing SHA"],
    [`load ${SHA}`, "load without an environment (images are per environment)"],
    [`load dev ${SHA}`, "load for an unknown environment"],
    [`load staging ${SHA} ${SHA}`, "load with an extra argument"],
    [`load staging ${SHA}; rm -rf /`, "shell metacharacters"],
    [`load $(id)`, "command substitution"],
    [`load staging ${SHA}\nrelease staging ${SHA}`, "newline (second command)"],
    [`load\tstaging ${SHA}`, "tab separator"],
    [`release  staging ${SHA}`, "double space"],
    [` load staging ${SHA}`, "leading space"],
    [`load staging ${SHA} `, "trailing space"],
    ["write-env staging umami", "Umami on staging"],
    ["write-env staging ../web", "path in role"],
    ["write-env staging postgres", "unknown role"],
    ["rollback", "missing environment"],
    [`load ${"a".repeat(200)}`, "over-long request"],
    ["LOAD " + SHA, "upper-case command"],
  ])("[P0-15] CI is refused %j (%s)", (request) => {
    const result = check("ci", request);
    expect(result.status).toBe(EX_USAGE);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^moz-deploy: refused: /);
  });

  it.each([
    "init-env staging",
    "bootstrap-db production",
    "status staging",
    `release staging ${SHA}`,
  ])("[P0-15] a developer may run %s", (request) => {
    expect(check("admin", request).status).toBe(0);
  });

  it.each(["init-env", "init-env qa", "status staging now", "shell"])(
    "[P0-15] a developer is refused %j",
    (request) => {
      expect(check("admin", request).status).toBe(EX_USAGE);
    },
  );
});

describe("[P0-15] moz-deploy images are per environment", () => {
  // Staging and production images of one commit differ (APP_ENV and public keys are build arguments), and both
  // stacks share one host: the same tag must never name both.
  it("[P0-15] each environment has its own image repository and release directory", () => {
    const result = run(
      'for e in staging production; do image_ref "$e" "$1"; release_dir "$e" "$1"; done',
      [SHA],
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual([
      `moz-rewards-staging:${SHA}`,
      `/var/lib/moz/releases/staging/${SHA}`,
      `moz-rewards-production:${SHA}`,
      `/var/lib/moz/releases/production/${SHA}`,
    ]);
  });
});

describe("[P0-15] moz-deploy env files", () => {
  const bcrypt = "$2a$14$" + "a".repeat(53);

  it("[P0-15] quotes every value so Compose never interpolates it, and skips comments and blank lines", () => {
    const result = render(
      "staging",
      "caddy",
      `# comment\n\nAPP_HOST=staging.example.co.uk\nBASIC_AUTH_USER=moz\nBASIC_AUTH_HASH=${bcrypt}\n`,
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout.split("\n").slice(1)).toEqual([
      "APP_HOST='staging.example.co.uk'",
      "BASIC_AUTH_USER='moz'",
      `BASIC_AUTH_HASH='${bcrypt}'`,
      "",
    ]);
  });

  it("[P0-15] keeps a value with spaces, = and $ exactly", () => {
    const result = render(
      "staging",
      "web",
      "APP_URL=https://staging.example.co.uk\nREDIS_KEY_PREFIX=stg:\nFROM=Moz Rewards <a=b$c@x.uk>",
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("FROM='Moz Rewards <a=b$c@x.uk>'\n");
  });

  it.each([
    ["DATABASE_URL_WORKER=postgres://x", "the web can't be handed the worker role"],
    ["DATABASE_URL_MIGRATIONS=postgres://x", "the owner URL never goes into a file"],
    ["DATABASE_URL=postgres://x", "generated on the host"],
    ["REDIS_URL=rediss://x", "generated on the host"],
    ["NODE_OPTIONS=--require /tmp/x.js", "code injection"],
    ["LD_PRELOAD=/tmp/x.so", "code injection"],
    ["NODE_EXTRA_CA_CERTS=/tmp/ca", "TLS trust"],
    ["lower=1", "lower-case key"],
    ["1KEY=1", "key starting with a digit"],
    ["KEY", "no ="],
    ["KEY=it's", "single quote in a value"],
    ["KEY=a\r", "carriage return"],
    ["KEY=1\nKEY=2", "duplicate key"],
    ["export KEY=1", "shell syntax"],
  ])("[P0-15] refuses %j for web (%s)", (line) => {
    const result = render(
      "staging",
      "web",
      `APP_URL=https://x.uk\nREDIS_KEY_PREFIX=stg:\n${line}\n`,
    );
    expect(result.status).toBe(EX_INPUT);
    expect(result.stdout).not.toContain(line.split("=")[1] ?? "\u0000");
  });

  it.each([
    ["staging", "caddy", "APP_HOST=x\nBASIC_AUTH_USER=moz\n", "BASIC_AUTH_HASH"],
    ["staging", "cloudflared", "OTHER=1\n", "TUNNEL_TOKEN"],
    ["production", "umami", "OTHER=1\n", "APP_SECRET"],
    ["production", "caddy", "APP_HOST=x\nUMAMI_HOST=y\n", "MAINTENANCE"],
    ["staging", "web", "APP_URL=https://x.uk\n", "REDIS_KEY_PREFIX"],
  ])("[P0-15] %s/%s requires %s", (env, role, input, missing) => {
    const result = render(env, role, input);
    expect(result.status).toBe(EX_INPUT);
    expect(result.stderr).toContain(`${missing} is required`);
  });

  it("[P0-15] refuses a plain password as BASIC_AUTH_HASH (Caddy needs the bcrypt hash)", () => {
    const result = render(
      "staging",
      "caddy",
      "APP_HOST=x\nBASIC_AUTH_USER=moz\nBASIC_AUTH_HASH=hunter2\n",
    );
    expect(result.status).toBe(EX_INPUT);
    expect(result.stdout).not.toContain("hunter2");
  });

  const B2 = "B2_KEY_ID=003a1b2c3d4e5f60000000009\nB2_APP_KEY=K003abcdefghijklmnopqrstuvwxyzABCD\n";

  it.each(["staging", "production"])(
    "[P0-15] %s/backup takes exactly the B2 key pair (D1)",
    (env) => {
      expect(check("ci", `write-env ${env} backup`).status).toBe(0);
      const result = render(env, "backup", B2);
      expect(result.stderr).toBe("");
      expect(result.stdout.split("\n").slice(1)).toEqual([
        "B2_KEY_ID='003a1b2c3d4e5f60000000009'",
        "B2_APP_KEY='K003abcdefghijklmnopqrstuvwxyzABCD'",
        "",
      ]);
    },
  );

  it.each([
    ["S3_ENDPOINT=https://evil.example\n", "the endpoint is fixed in moz-backup"],
    ["S3_BUCKET=other\n", "the bucket is fixed in moz-backup"],
    ["WALG_S3_PREFIX=s3://other\n", "wal-g settings are built on the host"],
    ["PGP_KEY=x\n", "the key is pinned on the host"],
  ])("[P0-15] backup refuses %j (%s)", (line) => {
    const result = render("staging", "backup", B2 + line);
    expect(result.status).toBe(EX_INPUT);
    expect(result.stderr).toMatch(/only B2_KEY_ID and B2_APP_KEY/);
  });

  it.each([
    ["B2_KEY_ID=003a1b2c3d4e5f60000000009\n", "B2_APP_KEY is required"],
    [
      "B2_KEY_ID=has space\nB2_APP_KEY=K003abcdefghijklmnopqrstuvwxyzABCD\n",
      "B2_KEY_ID is malformed",
    ],
    ["B2_KEY_ID=003a1b2c3d4e5f60000000009\nB2_APP_KEY=short\n", "B2_APP_KEY is malformed"],
  ])("[P0-15] backup refuses %j", (input, message) => {
    const result = render("staging", "backup", input);
    expect(result.status).toBe(EX_INPUT);
    expect(result.stderr).toContain(message);
  });

  it("[P0-15] refuses more than 64 KiB", () => {
    const result = render("staging", "cloudflared", `TUNNEL_TOKEN=${"a".repeat(70_000)}\n`);
    expect(result.status).toBe(EX_INPUT);
  });
});

describe("[P0-15] D2: wal-g settings are built on the host from the B2 key pair alone", () => {
  const ID = "003a1b2c3d4e5f60000000009";
  const KEY = "K003abcdefghijklmnopqrstuvwxyzABCD";

  it.each(["staging", "production"])(
    "[P0-15] %s: fixed endpoint, region, bucket and per-environment prefix; only the key pair varies",
    (env) => {
      const r = run('walg_env "$1" "$2" "$3"', [env, ID, KEY]);
      expect(r.status).toBe(0);
      expect(r.stdout.split("\n").slice(1)).toEqual([
        `AWS_ACCESS_KEY_ID='${ID}'`,
        `AWS_SECRET_ACCESS_KEY='${KEY}'`,
        "AWS_ENDPOINT='https://s3.eu-central-003.backblazeb2.com'",
        "AWS_REGION='eu-central-003'",
        "AWS_S3_FORCE_PATH_STYLE='true'",
        `WALG_S3_PREFIX='s3://mozrewards-backups-dfd829/${env}/wal'`,
        "",
      ]);
    },
  );

  it.each([
    ["has space", KEY],
    [ID, "short"],
    [ID, "K003abc'; touch /tmp/x; '"],
  ])("[P0-15] refuses a malformed key pair %j", (id, key) => {
    const r = run('walg_env staging "$1" "$2"', [id, key]);
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain("AWS_SECRET_ACCESS_KEY");
  });

  it("[P0-15] the settings file moz-deploy writes is exactly what moz-walg accepts", () => {
    const walg = readFileSync(path.join(root, "infra", "postgres", "moz-walg"), "utf8");
    const written = run('walg_env staging "$1" "$2"', [ID, KEY]).stdout;
    for (const key of [...written.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1] ?? "")) {
      expect(walg).toContain(`      ${key}) W_`);
    }
  });

  it("[P0-15] endpoint, region, bucket and pinned key are the same in moz-deploy and moz-backup", () => {
    const backup = readFileSync(path.join(root, "infra", "host", "moz-backup"), "utf8");
    const deploy = readFileSync(path.join(root, "infra", "host", "moz-deploy"), "utf8");
    const value = (src: string, name: string): string =>
      src
        .split("\n")
        .map((l) => l.replace(/^readonly /, ""))
        .find((l) => l.startsWith(`${name}=`))
        ?.slice(name.length + 1) ?? "";
    expect(value(deploy, "B2_ENDPOINT")).toBe(value(backup, "S3_ENDPOINT"));
    expect(value(deploy, "B2_REGION")).toBe(value(backup, "S3_REGION"));
    expect(value(deploy, "B2_BUCKET")).toBe(value(backup, "S3_BUCKET"));
    expect(value(deploy, "BACKUP_KEY_FPR")).toBe(value(backup, "PUBKEY_FPR"));
    expect(value(deploy, "BACKUP_PUBKEY")).toBe(value(backup, "PUBKEY"));
    expect(value(deploy, "BACKUP_KEY_FPR")).toMatch(/^[0-9A-F]{40}$/);
  });

  it("[P0-15] init-env starts with the archive-off lever set and enables both backup timers", () => {
    const deploy = readFileSync(path.join(root, "infra", "host", "moz-deploy"), "utf8");
    const init = /cmd_init_env\(\) \{[\s\S]*?\n\}/.exec(deploy)?.[0] ?? "";
    expect(init).toContain('pin_backup_key "$env"');
    expect(init).toMatch(/! -s \$etc\/walg\/walg.env && ! -e \$etc\/backup-lever\/archive-off/);
    expect(init).toContain("for unit in moz-backup moz-basebackup; do");
  });
});
