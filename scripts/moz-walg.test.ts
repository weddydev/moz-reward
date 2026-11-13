import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findBash } from "./lib/find-bash";

/**
 * P0-15 D2: `infra/postgres/moz-walg`, the wal-g wrapper inside the Postgres image (archive_command and the
 * weekly base backup). These tests source it in bash and drive its checks with a fake wal-g: arguments, the WAL
 * path allowlist, the settings allowlist, the archive-off lever and the pinned key. The real wal-g against MinIO
 * in the production image is tests/integration/walg-archive.test.ts.
 */
const root = path.resolve(import.meta.dirname, "..");
const fwd = (p: string): string => p.replaceAll("\\", "/");
const script = fwd(path.join(root, "infra", "postgres", "moz-walg"));
const bash = findBash();
const tmp = mkdtempSync(path.join(tmpdir(), "moz-walg-unit-"));
const conf = path.join(tmp, "conf");
const gnupg = path.join(tmp, "g");
let FPR = "";
let OTHER = "";

const GOOD_ENV = [
  "AWS_ACCESS_KEY_ID='0031a2b3c4d5e6f70000000001'",
  "AWS_SECRET_ACCESS_KEY='K003abcdefghijklmnopqrstuvwxyz0123'",
  "AWS_ENDPOINT='https://s3.eu-central-003.backblazeb2.com'",
  "AWS_REGION='eu-central-003'",
  "AWS_S3_FORCE_PATH_STYLE='true'",
  "WALG_S3_PREFIX='s3://mozrewards-backups-dfd829/staging/wal'",
].join("\n");

function gpg(args: string[]): string {
  const r = spawnSync("gpg", ["--homedir", gnupg, "--batch", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`gpg ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}
const newKey = (uid: string): string => {
  gpg(["--pinentry-mode", "loopback", "--passphrase", "", "--quick-gen-key", uid, "default", "default", "never"]); // prettier-ignore
  const colons = gpg(["--with-colons", "--list-keys", uid]);
  return /^fpr:+([0-9A-F]{40}):/m.exec(colons)?.[1] ?? "";
};

beforeAll(() => {
  mkdirSync(gnupg, { mode: 0o700 });
  mkdirSync(conf);
  FPR = newKey("Walg Unit <walg-unit@example.invalid>");
  OTHER = newKey("Other <other@example.invalid>");
  writeFileSync(path.join(conf, "public.asc"), gpg(["--armor", "--export", FPR]));
  writeFileSync(path.join(conf, "fingerprint"), `${FPR}\n`);
  writeFileSync(path.join(conf, "walg.env"), `${GOOD_ENV}\n`);
}, 60_000);
afterAll(() => {
  spawnSync("gpgconf", ["--homedir", gnupg, "--kill", "all"]);
  rmSync(tmp, { recursive: true, force: true });
});

type Run = { status: number | null; stdout: string; stderr: string };
/** Sources the wrapper with CONF_DIR, LEVER and wal-g pointed at the temp dir; the fake wal-g prints its env. */
function run(body: string, opts: { confDir?: string; lever?: boolean } = {}): Run {
  const lever = path.join(tmp, "lever-archive-off");
  if (opts.lever) writeFileSync(lever, "");
  else rmSync(lever, { force: true });
  const fake = path.join(tmp, "fake-walg");
  writeFileSync(fake, '#!/bin/sh\necho "ARGS $*"\nenv | sort\n', { mode: 0o755 });
  const r = spawnSync(
    bash,
    [
      "-c",
      `source "$1"; CONF_DIR="$2" LEVER="$3" WALG="$4" PGDATA="$5"; TMPDIR="$6"; ${body}`,
      "_",
      script,
      fwd(opts.confDir ?? conf),
      fwd(lever),
      fwd(fake),
      fwd(tmp),
      fwd(tmp),
    ],
    { encoding: "utf8", env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } },
  );
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("[P0-15] moz-walg arguments", () => {
  it("[P0-15] accepts only wal-push <path> and backup-push", () => {
    expect(run("main").status).toBe(64);
    expect(run("main wal-push").status).toBe(64);
    expect(run("main wal-push pg_wal/000000010000000000000001 extra").status).toBe(64);
    expect(run("main backup-push now").status).toBe(64);
    expect(run("main restore").status).toBe(64);
  });

  it("[P0-15] archives only paths Postgres hands archive_command (segments, history, backup labels)", () => {
    for (const ok of [
      "pg_wal/000000010000000000000001",
      "pg_wal/000000010000000000000001.partial",
      "pg_wal/00000002.history",
      "pg_wal/000000010000000000000002.00000028.backup",
    ]) {
      const r = run(`cmd_wal_push '${ok}'`);
      expect(r.stderr, ok).not.toContain("unexpected WAL path");
      expect(r.status, ok).toBe(0);
    }
    for (const bad of [
      "/etc/shadow",
      "pg_wal/../../etc/passwd",
      "pg_wal/00000001000000000000000",
      "base/1/1259",
      "pg_wal/000000010000000000000001;id",
    ]) {
      const r = run(`cmd_wal_push '${bad}'`);
      expect(r.status, bad).toBe(1);
      expect(r.stderr, bad).toContain("unexpected WAL path");
    }
  });
});

describe("[P0-15] moz-walg runs wal-g only with fixed, allowlisted settings and encryption forced on", () => {
  it("[P0-15] passes the six settings, the pinned key path and the fixed options, and nothing from its own environment", () => {
    const r = run(
      `export AWS_SHARED_CREDENTIALS_FILE=/x WALG_LIBSODIUM_KEY=y; cmd_wal_push pg_wal/000000010000000000000001`,
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ARGS wal-push pg_wal/000000010000000000000001");
    for (const line of [
      "AWS_ACCESS_KEY_ID=0031a2b3c4d5e6f70000000001",
      "AWS_ENDPOINT=https://s3.eu-central-003.backblazeb2.com",
      "AWS_S3_FORCE_PATH_STYLE=true",
      "WALG_S3_PREFIX=s3://mozrewards-backups-dfd829/staging/wal",
      `WALG_PGP_KEY_PATH=${fwd(conf)}/public.asc`,
      "WALG_COMPRESSION_METHOD=zstd",
      "WALG_DELTA_MAX_STEPS=0",
      "WALG_PREVENT_WAL_OVERWRITE=false",
    ]) {
      expect(r.stdout).toContain(line);
    }
    expect(r.stdout).not.toContain("WALG_LIBSODIUM_KEY");
    expect(r.stdout).not.toContain("AWS_SHARED_CREDENTIALS_FILE");
  });

  it("[P0-15] refuses a settings file with any other key, a bad prefix or a missing value", () => {
    const cases: Array<[string, string]> = [
      [
        `${GOOD_ENV}\nWALG_PGP_KEY_PATH='/tmp/other.asc'`,
        "WALG_PGP_KEY_PATH is not an allowed setting",
      ],
      [`${GOOD_ENV}\nWALG_LIBSODIUM_KEY='x'`, "WALG_LIBSODIUM_KEY is not an allowed setting"],
      [GOOD_ENV.replace("staging/wal", "staging/dumps"), "WALG_S3_PREFIX missing or malformed"],
      [GOOD_ENV.replace("/staging/wal", "/other/wal"), "WALG_S3_PREFIX missing or malformed"],
      [GOOD_ENV.replace("'true'", "'false'"), "AWS_S3_FORCE_PATH_STYLE must be true"],
      [GOOD_ENV.replace(/^AWS_SECRET.*$/m, ""), "AWS_SECRET_ACCESS_KEY missing or malformed"],
      [
        GOOD_ENV.replace("AWS_REGION='eu-central-003'", "AWS_REGION=eu-central-003"),
        "unexpected line",
      ],
    ];
    for (const [body, message] of cases) {
      const dir = mkdtempSync(path.join(tmp, "conf-"));
      writeFileSync(path.join(dir, "walg.env"), `${body}\n`);
      writeFileSync(path.join(dir, "public.asc"), gpg(["--armor", "--export", FPR]));
      writeFileSync(path.join(dir, "fingerprint"), FPR);
      const r = run("cmd_wal_push pg_wal/000000010000000000000001", { confDir: dir });
      expect(r.status, message).toBe(1);
      expect(r.stderr, message).toContain(message);
      expect(r.stdout, message).not.toContain("ARGS");
    }
  });

  it("[P0-15] fails (Postgres keeps the segment and retries) when archiving is not configured yet", () => {
    const empty = mkdtempSync(path.join(tmp, "empty-"));
    const r = run("cmd_wal_push pg_wal/000000010000000000000001", { confDir: empty });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("archiving is not configured");
  });
});

describe("[P0-15] moz-walg never uploads without the pinned key (design check HIGH 2)", () => {
  const withKey = (armored: string, pinned: string): Run => {
    const dir = mkdtempSync(path.join(tmp, "key-"));
    writeFileSync(path.join(dir, "walg.env"), `${GOOD_ENV}\n`);
    writeFileSync(path.join(dir, "public.asc"), armored);
    writeFileSync(path.join(dir, "fingerprint"), pinned);
    return run("cmd_wal_push pg_wal/000000010000000000000001; cmd_backup_push", { confDir: dir });
  };

  it("[P0-15] refuses another key, two keys, a non-key file, a missing pin or a short pin", () => {
    const cases: Array<[string, string, string]> = [
      [gpg(["--armor", "--export", OTHER]), FPR, "not the pinned"],
      [gpg(["--armor", "--export", FPR, OTHER]), FPR, "exactly one key (found 2)"],
      ["not a key\n", FPR, "is not an OpenPGP key"],
      [gpg(["--armor", "--export", FPR]), "", "not a full key fingerprint"],
      [gpg(["--armor", "--export", FPR]), FPR.slice(-16), "not a full key fingerprint"],
    ];
    for (const [armored, pinned, message] of cases) {
      const r = withKey(armored, pinned);
      expect(r.status, message).toBe(1);
      expect(r.stderr, message).toContain(message);
      expect(r.stdout, message).not.toContain("ARGS");
    }
  });

  it("[P0-15] the pinned key passes for both wal-push and backup-push", () => {
    const r = withKey(gpg(["--armor", "--export", FPR]), FPR);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ARGS wal-push pg_wal/000000010000000000000001");
    expect(r.stdout).toContain(`ARGS backup-push ${fwd(tmp)}`);
  });
});

describe("[P0-15] the archive-off lever (design check HIGH 3)", () => {
  it("[P0-15] wal-push reports success without running wal-g, even with no settings at all", () => {
    const empty = mkdtempSync(path.join(tmp, "empty-"));
    const r = run("cmd_wal_push pg_wal/000000010000000000000001", { confDir: empty, lever: true });
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain("ARGS");
    expect(r.stderr).toContain("archive-off lever is set");
  });

  it("[P0-15] a base backup is refused while the lever is set (it could not be restored to a point in time)", () => {
    const r = run("cmd_backup_push", { lever: true });
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain("ARGS");
    expect(r.stderr).toContain("archive-off lever is set");
  });

  it("[P0-15] every wal-g call runs under timeout", () => {
    const r = run("declare -f walg");
    expect(r.stdout).toMatch(/timeout --kill-after=15 "\$seconds" env -i/);
  });
});
