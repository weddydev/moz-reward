import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findBash } from "../../scripts/lib/find-bash";
import { baseTestUrl, templateName } from "../support/db";

/**
 * P0-15 D1, end to end on the dev services: infra/host/moz-backup dumps a cloned test database through gpg (an
 * ephemeral key, public half only on the "host"), uploads it to MinIO as a user that may only list and write,
 * checks what was stored, and runs the restore drill in a scratch container with no network. The tests then read
 * the object back as the MinIO admin, decrypt it with the private half and list the archive. Failure paths:
 * wrong pinned key, pg_dump failing, a tampered object, a restore that fails its checks.
 *
 * Needs Docker (Postgres + MinIO from `pnpm services:up`), gpg and curl ≥ 7.75 on the machine running the tests.
 */
const root = path.resolve(import.meta.dirname, "..", "..");
const fwd = (p: string): string => p.replaceAll("\\", "/");
const SCRIPT = fwd(path.join(root, "infra", "host", "moz-backup"));
const PG = "moz-rewards-postgres-1";
const MINIO = "moz-rewards-minio-1";
const BUCKET = "moz-backups-test";
const KEY_ID = "backuptest01";
const SECRET = "backup-test-secret-not-real-0001";
const SRC_DB = `moz_backup_src_${String(process.pid)}`;
const SHA = "0123456789abcdef0123456789abcdef01234567";
const bash = findBash();
const T = mkdtempSync(path.join(tmpdir(), "moz-backup-e2e-"));
const GNUPG = path.join(T, "gnupg");
let FPR = "";

function sh(cmd: string, args: string[], input?: string | Buffer): SpawnSyncReturns<Buffer> {
  return spawnSync(cmd, args, { input, maxBuffer: 256 * 1024 * 1024 });
}
function must(cmd: string, args: string[], input?: string | Buffer): Buffer {
  const r = sh(cmd, args, input);
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr.toString().slice(0, 600)}`);
  }
  return r.stdout;
}
const mc = (command: string, input?: string | Buffer): SpawnSyncReturns<Buffer> =>
  sh(
    "docker",
    [
      "exec",
      "-i",
      MINIO,
      "sh",
      "-c",
      `export MC_CONFIG_DIR=/tmp/.mc-backup-test MC_HOST_local=http://moz:moz-minio-local@127.0.0.1:9000; ${command}`,
    ],
    input,
  );

/** Runs bash with moz-backup sourced and pointed at the dev services and the temp "host". */
function host(body: string, extra = ""): { status: number | null; stdout: string; stderr: string } {
  const prelude = `
    source "$SCRIPT"
    S3_ENDPOINT=http://127.0.0.1:9000 S3_REGION=us-east-1 S3_BUCKET=${BUCKET}
    PUBKEY="$T/pub.asc" PUBKEY_FPR="$FPR" MOZ_ETC_ROOT="$T/etc" MOZ_DATA_ROOT="$T/data" DRILL_READY_SECONDS=120
    pg_container() { echo ${PG}; }
    pg_exec() { shift; docker exec -i -e PGUSER=moz ${PG} "$@"; }
    src_db() { echo "$SRC_DB"; }
    drill_due() { false; }
    # The dev database is owned by the local superuser "moz"; production objects belong to bootstrap's roles.
    eval "orig_$(declare -f drill_bootstrap)"
    drill_bootstrap() { orig_drill_bootstrap "$@"; scratch_psql -d postgres -c 'CREATE ROLE moz NOLOGIN' >/dev/null; }
    ${extra}
  `;
  const r = spawnSync(bash, ["-c", `${prelude}\n${body}`], {
    encoding: "utf8",
    env: {
      ...process.env,
      SCRIPT,
      T: fwd(T),
      FPR,
      SRC_DB,
      GNUPGHOME: fwd(GNUPG),
      RK: fwd(path.join(root, "infra", "backup", "moz-backup-public.asc")),
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const ownerUrl = (db: string): string => {
  const url = new URL(baseTestUrl());
  url.pathname = `/${db}`;
  return url.toString();
};
const admin = postgres(ownerUrl("postgres"), { max: 1, onnotice: () => {} });
let src: postgres.Sql;

const heartbeat = async (name: string): Promise<Date | undefined> => {
  const rows = await src<
    { at: Date }[]
  >`SELECT last_run_at AS at FROM job_heartbeats WHERE name = ${name}`;
  return rows[0]?.at;
};
const listKeys = (): string[] => {
  const r = mc(`mc ls --recursive local/${BUCKET}/staging/`);
  return r.stdout
    .toString()
    .split("\n")
    .map((l) => l.trim().split(/\s+/).pop() ?? "")
    .filter((k) => k.endsWith(".dump.gpg"))
    .map((k) => `staging/${k}`);
};

beforeAll(async () => {
  for (const tool of [
    ["gpg", "--version"],
    ["curl", "--version"],
    ["docker", "version"],
  ]) {
    const r = sh(tool[0] ?? "", tool.slice(1));
    if (r.status !== 0)
      throw new Error(`${tool[0] ?? ""} is needed for this test (macOS: brew install gnupg)`);
  }

  // An ephemeral backup key: the "host" gets only the public half; the test keeps the private half to decrypt.
  mkdirSync(GNUPG, { mode: 0o700 });
  must("gpg", [
    "--homedir", GNUPG, "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
    "--quick-gen-key", "Backup Test <backup-test@example.invalid>", "default", "default", "never",
  ]); // prettier-ignore
  const colons = must("gpg", ["--homedir", GNUPG, "--with-colons", "--list-keys"]).toString();
  FPR = /^fpr:+([0-9A-F]{40}):/m.exec(colons)?.[1] ?? "";
  writeFileSync(
    path.join(T, "pub.asc"),
    must("gpg", ["--homedir", GNUPG, "--armor", "--export", FPR]),
  );

  // A copy of the migrated test database as the backup source.
  await admin.unsafe(`CREATE DATABASE ${SRC_DB} TEMPLATE ${templateName()}`);
  src = postgres(ownerUrl(SRC_DB), { max: 1, onnotice: () => {} });

  // MinIO: a bucket and a user that may only list and write (no read, no delete), like the H-42 B2 keys.
  const policy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["s3:ListBucket", "s3:ListBucketVersions"],
        Resource: [`arn:aws:s3:::${BUCKET}`],
      },
      { Effect: "Allow", Action: ["s3:PutObject"], Resource: [`arn:aws:s3:::${BUCKET}/*`] },
    ],
  });
  const setup = mc(
    `cat > /tmp/backup-test-policy.json && mc mb --ignore-existing local/${BUCKET} >/dev/null &&
     mc rm --recursive --force local/${BUCKET}/staging/ >/dev/null 2>&1;
     mc admin user add local ${KEY_ID} ${SECRET} >/dev/null &&
     mc admin policy create local backup-write-list /tmp/backup-test-policy.json >/dev/null &&
     { mc admin policy attach local backup-write-list --user ${KEY_ID} >/dev/null 2>&1 || true; }`,
    policy,
  );
  if (setup.status !== 0) throw new Error(`MinIO setup failed: ${setup.stderr.toString()}`);

  // The "host": credentials file as moz-deploy writes it, and the current release's infra files.
  mkdirSync(path.join(T, "etc", "staging", "env"), { recursive: true });
  writeFileSync(
    path.join(T, "etc", "staging", "env", "backup.env"),
    `# Written by moz-deploy write-env (staging/backup). Do not edit by hand.\nB2_KEY_ID='${KEY_ID}'\nB2_APP_KEY='${SECRET}'\n`,
  );
  const infra = path.join(T, "data", "releases", "staging", SHA, "infra");
  mkdirSync(path.join(infra, "postgres"), { recursive: true });
  mkdirSync(path.join(infra, "backup"), { recursive: true });
  copyFileSync(
    path.join(root, "infra", "postgres", "bootstrap.sql"),
    path.join(infra, "postgres", "bootstrap.sql"),
  );
  copyFileSync(
    path.join(root, "infra", "backup", "checks.sql"),
    path.join(infra, "backup", "checks.sql"),
  );
  mkdirSync(path.join(T, "data", "staging"), { recursive: true });
  writeFileSync(path.join(T, "data", "staging", "release-current"), `${SHA}\n`, { flag: "w" });
}, 120_000);

afterAll(async () => {
  sh("docker", ["rm", "-f", "moz-staging-drill"]);
  await src.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${SRC_DB} WITH (FORCE)`);
  await admin.end();
  rmSync(T, { recursive: true, force: true });
});

describe("[P0-15] moz-backup end to end (dev Postgres + MinIO)", () => {
  let key = "";
  let cipher: Buffer = Buffer.alloc(0);

  it("[P0-15] the committed backup key has exactly the fingerprint pinned in the script", () => {
    // The script's own PUBKEY_FPR constant, not the test key's.
    const r = host(
      'PUBKEY_FPR=$(sed -n "s/^PUBKEY_FPR=//p" "$SCRIPT"); PUBKEY="$RK"; GNUPG_TMP=$(mktemp -d); check_key; rm -rf "$GNUPG_TMP"',
    );
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  }, 30_000);

  it("[P0-15] run: dumps, encrypts, uploads as a list+write-only user, checks the upload, writes backup:dump", async () => {
    const before = await heartbeat("backup:dump");
    const r = host("dispatch run staging");
    expect(r.stderr).toMatch(
      /dump moz: staging\/dumps\/\d{4}-\d{2}-\d{2}\/moz-\d{8}T\d{6}Z\.dump\.gpg, \d+ bytes, sha256 [0-9a-f]{64}/,
    );
    expect(r.status).toBe(0);
    expect((await heartbeat("backup:dump"))?.getTime()).toBeGreaterThan(before?.getTime() ?? 0);

    const keys = listKeys();
    expect(keys).toHaveLength(1);
    key = keys[0] ?? "";
    cipher = mc(`mc cat local/${BUCKET}/${key}`).stdout;
    expect(cipher.length).toBeGreaterThan(1000);
    // Never in clear: an OpenPGP message, not a pg_dump archive.
    expect(cipher.subarray(0, 5).toString()).not.toBe("PGDMP");
    expect([0x84, 0x85, 0x86, 0x87, 0xc1]).toContain(cipher[0]);

    const stat = JSON.parse(mc(`mc stat --json local/${BUCKET}/${key}`).stdout.toString()) as {
      metadata?: Record<string, string>;
    };
    const meta = Object.fromEntries(
      Object.entries(stat.metadata ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    expect(meta["x-amz-meta-sha256"]).toBe(createHash("sha256").update(cipher).digest("hex"));

    // Nothing left in the work directory.
    expect(
      readdirSync(path.join(T, "data", "staging", "backup-work")).filter(
        (f) => !f.startsWith(".gnupg"),
      ),
    ).toEqual([]);
  }, 120_000);

  it("[P0-15] the uploaded object decrypts with the private key into a complete pg_dump archive", () => {
    const plain = must("gpg", ["--homedir", GNUPG, "--batch", "--pinentry-mode", "loopback", "--passphrase", "", "--decrypt"], cipher); // prettier-ignore
    expect(plain.subarray(0, 5).toString()).toBe("PGDMP");
    const toc = must("docker", ["exec", "-i", PG, "pg_restore", "--list"], plain).toString();
    expect(toc).toMatch(/TABLE DATA public job_heartbeats/);
    expect(toc).toMatch(/TABLE public shops/);
  });

  it("[P0-15] the host's B2 user can't read the backup back (list + write only)", () => {
    const r = host(`load_creds staging; s3 -o /dev/null "$S3_ENDPOINT/$S3_BUCKET/${key}"`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/403/);
  });

  it("[P0-15] a stored object that differs from what was sent fails the check", () => {
    const size = cipher.length;
    const md5 = createHash("md5").update(cipher).digest("hex");
    expect(
      host(
        `load_creds staging; check_stored "${key}" ${String(size)} ${md5} "" "$(list_objects "${key}")"`,
      ).status,
    ).toBe(0);
    expect(
      mc(
        `mc pipe local/${BUCKET}/${key}`,
        Buffer.concat([cipher.subarray(0, size - 1), Buffer.from([0])]),
      ).status,
    ).toBe(0);
    const r = host(
      `load_creds staging; check_stored "${key}" ${String(size)} ${md5} "" "$(list_objects "${key}")"`,
    );
    expect(r.status).toBe(1);
    // mc pipe re-uploads as multipart; either way the stored object is not what was sent.
    expect(r.stderr).toMatch(/stored ETag differs|stored as a multipart upload/);
  });

  it("[P0-15] a key file with another fingerprint fails the run before anything is uploaded (backup:dump-failed)", async () => {
    const count = listKeys().length;
    const r = host("dispatch run staging", `PUBKEY_FPR=${"0".repeat(40)}`);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not the pinned 0{40}/);
    expect(r.stderr).toMatch(/FAILED: dump \(staging\)/);
    expect(listKeys()).toHaveLength(count);
    expect((await heartbeat("backup:dump-failed"))?.getTime()).toBeGreaterThan(
      (await heartbeat("backup:dump"))?.getTime() ?? Infinity,
    );
  }, 60_000);

  it("[P0-15] a failing pg_dump is caught (PIPESTATUS), nothing is uploaded and no file is left behind", async () => {
    const count = listKeys().length;
    const r = host(
      "dispatch run staging",
      `src_db() { if [[ $2 == moz && -z \${HB:-} ]]; then echo no_such_db; else echo "$SRC_DB"; fi; }
       eval "orig_$(declare -f heartbeat)"; heartbeat() { HB=1 orig_heartbeat "$@"; }`,
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/pg_dump of moz failed/);
    expect(listKeys()).toHaveLength(count);
    expect(
      readdirSync(path.join(T, "data", "staging", "backup-work")).filter((f) => f.endsWith(".gpg")),
    ).toEqual([]);
    expect(await heartbeat("backup:dump-failed")).toBeInstanceOf(Date);
  }, 60_000);

  it("[P0-15] drill: restores into a scratch container with no network, every check passes, backup:restore-drill", async () => {
    const r = host("dispatch drill staging");
    expect(r.stderr).toMatch(/drill: migrations\|pass\|\d+ applied, expected \d+/);
    expect(r.stderr).toMatch(/drill: all\|pass\|every check passed/);
    expect(r.status).toBe(0);
    expect(await heartbeat("backup:restore-drill")).toBeInstanceOf(Date);
    expect(
      must("docker", ["ps", "-aq", "--filter", "name=^moz-staging-drill$"]).toString().trim(),
    ).toBe("");
  }, 240_000);

  it("[P0-15] drill: a restore that fails a check writes backup:restore-drill-failed and removes the container", async () => {
    await src.unsafe("ALTER TABLE shops NO FORCE ROW LEVEL SECURITY");
    try {
      const r = host("dispatch drill staging");
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/backup check failed: rls \(missing on shops\)/);
      expect(r.stderr).toMatch(/FAILED: restore-drill \(staging\)/);
      expect((await heartbeat("backup:restore-drill-failed"))?.getTime()).toBeGreaterThan(
        (await heartbeat("backup:restore-drill"))?.getTime() ?? Infinity,
      );
      expect(
        must("docker", ["ps", "-aq", "--filter", "name=^moz-staging-drill$"]).toString().trim(),
      ).toBe("");
    } finally {
      await src.unsafe("ALTER TABLE shops FORCE ROW LEVEL SECURITY");
    }
  }, 240_000);
});
