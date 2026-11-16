import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    "write-env staging origin-tls",
    "write-env production cloudflared",
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
    ["seed-reset staging", "developer/timer-only command (weekly demo reset, C-38)"],
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
    ["write-env staging cloudflared", "no Tunnel on staging until launch (T-5)"],
    ["write-env production origin-tls", "production is reached through the Tunnel"],
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
    "seed-reset staging",
    `release staging ${SHA}`,
  ])("[P0-15] a developer may run %s", (request) => {
    expect(check("admin", request).status).toBe(0);
  });

  it.each([
    "init-env",
    "init-env qa",
    "status staging now",
    "shell",
    // Demo data never exists in production (assertSeedAllowed); the helper refuses before any container runs.
    "seed-reset production",
    "seed-reset",
    "seed-reset staging now",
  ])("[P0-15] a developer is refused %j", (request) => {
    expect(check("admin", request).status).toBe(EX_USAGE);
  });
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

describe("[P0-15] C1b: only staging's Caddy publishes a port, and only IPv4 TCP 443", () => {
  it.each([
    ["staging", "caddy", "443/tcp -> 0.0.0.0:443"],
    ["staging", "web-1", ""],
    ["staging", "postgres", ""],
    ["production", "caddy", ""],
    ["production", "cloudflared", ""],
  ])("[P0-15] %s %s → %j", (env, svc, expected) => {
    const result = run('expected_ports "$1" "$2"', [env, svc]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(expected);
  });
});

/**
 * C1b item 11: `write-env staging origin-tls` takes the Cloudflare Origin CA certificate and its key on stdin.
 * Fixtures are made with OpenSSL here: CAs named like Cloudflare's two Origin CAs (the issuer the real staging
 * certificate has: O=CloudFlare, Inc., OU=CloudFlare Origin SSL ECC Certificate Authority), and an unrelated CA.
 */
describe(
  "[P0-15] C1b: the staging origin certificate is validated before Caddy gets it",
  { timeout: 60_000 },
  () => {
    const HOST = "staging.example.com";
    let fixtures = "";
    beforeAll(() => {
      const made = spawnSync(
        bash,
        [
          "-c",
          String.raw`set -euo pipefail
export MSYS_NO_PATHCONV=1
d=$(mktemp -d); cd "$d"
cf="/C=US/ST=California/L=San Francisco/O=CloudFlare, Inc."
ca() { openssl req -x509 -new -nodes -newkey "$2" $3 -days 3650 -subj "$4" -keyout "$1.key" -out "$1.crt" 2>/dev/null; }
ca cfecc ec "-pkeyopt ec_paramgen_curve:P-256" "$cf/OU=CloudFlare Origin SSL ECC Certificate Authority"
ca cfrsa rsa:2048 "" "$cf/OU=CloudFlare Origin SSL Certificate Authority/CN=CloudFlare Origin Certificate"
ca other ec "-pkeyopt ec_paramgen_curve:P-256" "/O=Example/OU=CloudFlare Origin SSL Certificate Authority"
# leaf <name> <ca> <days> <host> <keygen args…>
leaf() {
  local name=$1 ca=$2 days=$3 host=$4; shift 4
  openssl genpkey "$@" -out "$name.key" 2>/dev/null
  openssl req -new -key "$name.key" -subj "/O=CloudFlare, Inc./OU=CloudFlare Origin CA/CN=CloudFlare Origin Certificate" -out "$name.csr" 2>/dev/null
  printf 'subjectAltName=DNS:%s\n' "$host" > "$name.ext"
  openssl x509 -req -in "$name.csr" -CA "$ca.crt" -CAkey "$ca.key" -CAcreateserial -days "$days" -extfile "$name.ext" -out "$name.crt" 2>/dev/null
  cat "$name.crt" "$name.key" > "$name.pem"
}
ec256="-algorithm EC -pkeyopt ec_paramgen_curve:P-256"
leaf ecc cfecc 100 ${HOST} $ec256
leaf p384 cfecc 100 ${HOST} -algorithm EC -pkeyopt ec_paramgen_curve:P-384
leaf rsa cfrsa 100 ${HOST} -algorithm RSA -pkeyopt rsa_keygen_bits:2048
leaf rsa1024 cfrsa 100 ${HOST} -algorithm RSA -pkeyopt rsa_keygen_bits:1024
leaf p521 cfecc 100 ${HOST} -algorithm EC -pkeyopt ec_paramgen_curve:P-521
leaf ed cfecc 100 ${HOST} -algorithm ED25519
leaf short cfecc 20 ${HOST} $ec256
leaf wronghost cfecc 100 other.example.com $ec256
leaf wrongca other 100 ${HOST} $ec256
cat ecc.crt p384.key > mismatch.pem
openssl pkcs8 -topk8 -in ecc.key -v2 aes-256-cbc -passout pass:secret -out ecc.enc 2>/dev/null
cat ecc.crt ecc.enc > encrypted.pem
openssl pkey -in ecc.key -traditional -out ecc.trad 2>/dev/null
cat ecc.crt ecc.trad > traditional.pem
cat ecc.crt cfecc.crt ecc.key > chain.pem
cat ecc.crt ecc.key ecc.key > twokeys.pem
{ echo "subject=whatever"; cat ecc.pem; } > text.pem
head -n 3 ecc.crt > unterminated.pem
sed 's/$/\r/' ecc.pem > crlf.pem
cat ecc.key ecc.crt > keyfirst.pem
{ cat ecc.crt; echo; cat ecc.key; echo; } > blanks.pem
# Node needs a native path on Windows (Git Bash); cygpath does not exist elsewhere.
if command -v cygpath >/dev/null; then cygpath -m "$d"; else echo "$d"; fi`,
        ],
        { encoding: "utf8" },
      );
      if (made.status !== 0) throw new Error(`fixtures: ${made.stderr}`);
      fixtures = made.stdout.trim();
    }, 120_000);
    // OpenSSL on Windows writes CRLF; the host (Linux) and CI write LF. Only the "crlf" fixture keeps its CRs.
    const pem = (name: string): string => {
      const text = readFileSync(path.join(fixtures, `${name}.pem`), "utf8");
      return name === "crlf" ? text : text.replaceAll("\r\n", "\n");
    };
    afterAll(() => {
      rmSync(fixtures, { recursive: true, force: true });
    });
    const install = (input: string, host = HOST): Run =>
      run(
        `d=$(mktemp -d); trap 'rm -rf "$d"' EXIT; origin_tls_split "$d"; origin_tls_check "$d" "$1"; head -n 1 "$d/origin.crt" "$d/origin.key"`,
        [host],
        input,
      );

    it.each(["ecc", "p384", "rsa", "keyfirst", "blanks"])(
      "[P0-15] accepts a Cloudflare Origin CA certificate with its own key: %s",
      (name) => {
        const result = install(pem(name));
        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("-----BEGIN CERTIFICATE-----");
        // Built from parts so the secret scanner doesn't take the PEM header for a key.
        expect(result.stdout).toContain(["-----BEGIN", "PRIVATE", "KEY-----"].join(" "));
      },
    );

    it.each([
      ["rsa1024", "the RSA key is shorter than 2048 bits"],
      ["p521", "the key must be RSA (2048 bits or more) or EC P-256/P-384"],
      ["ed", "the key must be RSA (2048 bits or more) or EC P-256/P-384"],
      ["short", "the certificate expires within 30 days"],
      ["wronghost", "the certificate does not name staging.example.com"],
      ["wrongca", "the certificate is not issued by the Cloudflare Origin CA"],
      ["mismatch", "the key does not match the certificate"],
      ["encrypted", "only one CERTIFICATE and one unencrypted PRIVATE KEY block are accepted"],
      ["traditional", "only one CERTIFICATE and one unencrypted PRIVATE KEY block are accepted"],
      ["chain", "exactly one CERTIFICATE and one PRIVATE KEY block are required"],
      ["twokeys", "exactly one CERTIFICATE and one PRIVATE KEY block are required"],
      ["text", "text outside the PEM blocks"],
      ["unterminated", "unterminated CERTIFICATE block"],
      ["crlf", "carriage return in input"],
    ])("[P0-15] refuses %s: %s", (name, message) => {
      const result = install(pem(name));
      expect(result.status).toBe(EX_INPUT);
      expect(result.stderr).toBe(`moz-deploy: bad input: ${message}\n`);
      // Nothing of the key ever reaches the output.
      expect(result.stdout).toBe("");
    });

    it("[P0-15] refuses empty input, a key alone and a corrupted block", () => {
      expect(install("").status).toBe(EX_INPUT);
      const key = pem("ecc").slice(pem("ecc").indexOf("-----BEGIN PRIVATE KEY-----"));
      expect(install(key).stderr).toMatch(/exactly one CERTIFICATE/);
      const corrupt = pem("ecc").replace(/\n[A-Za-z0-9+/]{10}/, "\n!!!!!!!!!!");
      expect(install(corrupt).stderr).toMatch(/malformed CERTIFICATE block/);
    });

    /**
     * The whole command on a fresh host (the first staging deploy, 15 Nov): no origin.crt/origin.key yet. Host
     * paths point into a temp dir and ownership changes are no-ops (the tests don't run as root); `install -m` is split
     * into `install` + `chmod` because Git for Windows' `install -m` fails on NTFS (plain `chmod` works); no database
     * and no running release, so the expiry isn't recorded and Caddy isn't recreated.
     */
    const writeOriginTls = (input: string): Run =>
      run(
        String.raw`t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
etc_dir() { echo "$t/etc/$1"; }
data_dir() { echo "$t/data/$1"; }
chown() { :; }
install() { local a=() m=; while (($#)); do case $1 in -o | -g) shift 2 ;; -m) m=$2; shift 2 ;; *) a+=("$1"); shift ;; esac; done; command install "${"$"}{a[@]}" && { [[ -z $m ]] || chmod "$m" "${"$"}{a[-1]}"; }; }
record_origin_cert_expiry() { return 1; }
mkdir -p "$t/etc/staging/secrets" "$t/etc/staging/env"
printf "APP_HOST='%s'\n" "$1" >"$t/etc/staging/env/caddy.env"
cmd_write_origin_tls staging
head -n 1 "$t/etc/staging/caddy-tls/origin.crt"`,
        [HOST],
        input,
      );

    it("[P0-15] write-env staging origin-tls installs the first certificate on a fresh host", () => {
      const result = writeOriginTls(pem("ecc"));
      expect(result.stderr).toMatch(
        /^moz-deploy: wrote staging\/caddy-tls \(valid until \d{4}-\d{2}-\d{2}\)\n/,
      );
      expect(result.stderr).toMatch(/origin certificate expiry not recorded yet/);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("-----BEGIN CERTIFICATE-----\n");
    });

    it("[P0-15] reads the certificate's expiry as epoch seconds (recorded for health.origin_firewall)", () => {
      const result = run('origin_cert_expiry "$1"', [
        path.join(fixtures, "ecc.crt").replaceAll("\\", "/"),
      ]);
      expect(result.status).toBe(0);
      const days = (Number(result.stdout.trim()) * 1000 - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(98);
      expect(days).toBeLessThan(101);
    });
  },
);

describe("[P0-15] C1b review: staging Caddy starts only behind the firewall, and refuses clients without the origin-pull certificate", () => {
  it.each([
    ["staging", "false", 1],
    ["staging", "true", 0],
    ["production", "false", 0],
  ])(
    "[P0-15] require_origin_firewall %s with a check that runs %s → exit %d",
    (env, bin, status) => {
      const result = run('require_origin_firewall "$1" "$2"', [env, bin]);
      expect(result.status).toBe(status);
      if (status) expect(result.stderr).toMatch(/the origin firewall is not in place/);
    },
  );

  it.each([
    ["35", "000", true],
    ["56", "000", true],
    ["56", "", true],
    ["0", "401", false],
    ["22", "421", false],
    ["7", "000", false],
    ["28", "000", false],
    ["60", "000", false],
    ["56", "200", false],
  ])("[P0-15] mtls_probe_ok curl exit %s, HTTP %j → %s", (code, status, ok) => {
    expect(run('mtls_probe_ok "$1" "$2"', [code, status]).status === 0).toBe(ok);
  });

  /**
   * Staging deploy 43735134613 (15 Nov): Caddy has no healthcheck, so `up --wait` returned before it listened and
   * the probe got curl exit 7. The probe waits while nothing listens (exit 7, up to MTLS_WAIT_SECONDS); any other
   * answer is final. curl prints the code it is given in turn ($CODES), ip and sleep are faked.
   */
  const probe = (codes: string, wait = "5") =>
    run(
      String.raw`t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
etc_dir() { echo "$t"; }
mkdir -p "$t/env"; printf "APP_HOST='staging.example.com'\n" >"$t/env/caddy.env"
ip() { echo "1.1.1.1 via 10.0.0.1 dev eth0 src 203.0.113.9 uid 0"; }
sleep() { :; }
# curl runs in $(…): count the calls in a file.
echo 0 >"$t/n"
IFS=, read -ra codes <<<"$1"
curl() { local n; n=$(($(<"$t/n") + 1)); echo "$n" >"$t/n"; printf 000; return "${"$"}{codes[n - 1]}"; }
MTLS_WAIT_SECONDS=$2
check_origin_mtls staging
echo "tries=$(<"$t/n")"`,
      [codes, wait],
    );

  it("[P0-15] check_origin_mtls waits while Caddy is not listening yet (curl exit 7), then checks the refusal", () => {
    const result = probe("7,7,56");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("tries=3\n");
    expect(result.stderr).toMatch(
      /origin mTLS checked: refused without Cloudflare's client certificate \(curl exit 56\)/,
    );
  });

  it("[P0-15] check_origin_mtls fails at once on any answer but a TLS refusal, and when Caddy never listens", () => {
    const answered = probe("0,56");
    expect(answered.status).toBe(1);
    expect(answered.stderr).toMatch(
      /Caddy answered a client without Cloudflare's certificate \(curl exit 0/,
    );
    const never = probe("7,7,7,7,7,7,7", "3");
    expect(never.status).toBe(1);
    expect(never.stderr).toMatch(
      /Caddy did not accept connections on 203\.0\.113\.9:443 within 3 s/,
    );
  });
});

describe("[P0-15] weekly staging demo reset (C-38)", () => {
  const systemd = (name: string): string =>
    readFileSync(path.join(root, "infra", "host", "files", "systemd", name), "utf8");
  const helper = readFileSync(path.join(root, "infra", "host", "moz-deploy"), "utf8");

  it("[P0-15] the timer runs moz-deploy seed-reset staging on Mondays 04:30 London time, hardened like the backup units", () => {
    const service = systemd("moz-seed-reset.service");
    expect(service).toMatch(/^ExecStart=\/usr\/local\/sbin\/moz-deploy seed-reset staging$/m);
    for (const line of [
      "Type=oneshot",
      "UMask=0077",
      "PrivateTmp=yes",
      "ProtectSystem=strict",
      "ReadWritePaths=/var/lib/moz /run/lock",
      "NoNewPrivileges=yes",
    ]) {
      expect(service).toContain(`\n${line}\n`);
    }
    const timer = systemd("moz-seed-reset.timer");
    expect(timer).toMatch(/^OnCalendar=Mon \*-\*-\* 04:30:00 Europe\/London$/m);
    expect(timer).toMatch(/^Persistent=true$/m);
    expect(timer).toMatch(/^WantedBy=timers.target$/m);
    const harden = readFileSync(path.join(root, "infra", "host", "harden.sh"), "utf8");
    expect(harden).toContain("moz-seed-reset.service moz-seed-reset.timer");
    expect(helper).toContain("systemctl enable --now --quiet moz-seed-reset.timer");
  });

  it("[P0-15] the reset re-seeds with --reset on the current release, then re-runs the sign-in check; every staging release runs the check", () => {
    const reset = helper.slice(helper.indexOf("cmd_seed_reset() {"));
    expect(reset.slice(0, reset.indexOf("\n}\n"))).toMatch(
      /run --rm --no-deps -T worker node cli\/seed\.mjs --reset\n\s+demo_signin_check "\$env" "\$cur"/,
    );
    expect(helper).toMatch(
      /worker node cli\/demo-signin-check\.mjs --url http:\/\/web-1:3000 >&2 \|\|\n\s+die "demo sign-in check failed/,
    );
    const release = helper.slice(helper.indexOf("cmd_release() {"));
    expect(release.slice(0, release.indexOf("\n}\n"))).toContain(
      '[[ $env != staging ]] || demo_signin_check "$env" "$sha"',
    );
  });
});
