import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyPitr, type PitrOptions } from "../../scripts/backup-pitr";
import { gpgPath } from "../../scripts/lib/backup-common";
import { templateName } from "../support/db";

/**
 * P0-15 D3b (AC4), end to end: a cluster of the staging/production Postgres image with the real app schema
 * (bootstrap.sql roles + the migrated template) archives WAL and a base backup through moz-walg into a versioned
 * MinIO bucket as a list+write user, encrypted to an ephemeral key. Rows A are written, the time noted, rows B
 * written. `backup:verify --wal --target-time` with a list+read user then restores to that time in a scratch
 * container with no network: A is there, B is not, checks.sql passes. Also: an overwritten WAL object (its oldest
 * version is used), a plaintext data object, a target before any base backup, a target the WAL doesn't reach, the
 * wrong private key; nothing is left behind.
 *
 * Needs Docker (MinIO and the dev Postgres from `pnpm services:up`; the image is linux/amd64) and gpg.
 */
const root = path.resolve(import.meta.dirname, "..", "..");
const MINIO = "moz-rewards-minio-1";
const DEV_PG = "moz-rewards-postgres-1";
const NET = "moz-rewards_default";
const IMAGE = "moz-postgres:walg-test";
const PG = `moz-pitr-src-${String(process.pid)}`;
const BUCKET = "moz-pitr-test";
const WRITER = { id: "pitrwrite01", secret: "pitr-write-secret-not-real-01" };
const READER = { accessKeyId: "pitrread01", secretAccessKey: "pitr-read-secret-not-real-01" };
const T = mkdtempSync(path.join(tmpdir(), "moz-pitr-e2e-"));
const CONF = path.join(T, "conf");
const LEVER_DIR = path.join(T, "lever");
const GNUPG = path.join(T, "g");
const OTHER = path.join(T, "other");
let FPR = "";
let beforeBase = new Date(0);
let target = new Date(0);
let startSegment = "";
/** The base backup's start segment (its name is base_<this>). */
let baseSegment = "";

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
const mc = (command: string, input?: string | Buffer): Buffer =>
  must("docker", ["exec", "-i", MINIO, "sh", "-c", `export MC_CONFIG_DIR=/tmp/.mc-pitr-test MC_HOST_local=http://moz:moz-minio-local@127.0.0.1:9000; ${command}`], input); // prettier-ignore
const psql = (sql: string, db = "postgres"): string =>
  must("docker", ["exec", "-u", "postgres", PG, "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-d", db, "-c", sql]).toString().trim(); // prettier-ignore
const genKey = (home: string, uid: string): string => {
  mkdirSync(home, { mode: 0o700 });
  must("gpg", ["--homedir", gpgPath(home), "--batch", "--pinentry-mode", "loopback", "--passphrase", "", "--quick-gen-key", uid, "default", "default", "never"]); // prettier-ignore
  return /^fpr:+([0-9A-F]{40}):/m.exec(must("gpg", ["--homedir", gpgPath(home), "--with-colons", "--list-keys"]).toString())?.[1] ?? ""; // prettier-ignore
};
const exportSecret = (home: string, fpr: string, file: string) => {
  writeFileSync(file, must("gpg", ["--homedir", gpgPath(home), "--batch", "--pinentry-mode", "loopback", "--passphrase", "", "--armor", "--export-secret-keys", fpr])); // prettier-ignore
};
const encrypt = (plain: Buffer, extra: string[] = []): Buffer =>
  must("gpg", ["--homedir", gpgPath(GNUPG), "--batch", "--trust-model", "always", "--compress-algo", "none", ...extra, "--recipient", FPR, "--encrypt", "--output", "-"], plain); // prettier-ignore
/** Valid ciphertext with one byte flipped inside the encrypted body: only the integrity check can catch it. */
const tampered = (): Buffer => {
  const c = encrypt(Buffer.concat([Buffer.from("28b52ffd", "hex"), randomBytes(8192)]));
  c[c.length - 100] = (c[c.length - 100] ?? 0) ^ 0x01;
  return c;
};

async function until(check: () => boolean, what: string, ms = 120_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${what}`);
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Switches to a new segment and waits until the old one is in the archive. */
async function archiveNow(): Promise<void> {
  const current = psql("SELECT pg_walfile_name(pg_current_wal_lsn())");
  psql("SELECT pg_switch_wal()");
  await until(
    () => psql("SELECT coalesce(last_archived_wal, '') FROM pg_stat_archiver") >= current,
    `segment ${current} to be archived`,
  );
}

const admin = new S3Client({
  endpoint: "http://127.0.0.1:9000",
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: "moz", secretAccessKey: "moz-minio-local" },
});
const workDirs = () => readdirSync(tmpdir()).filter((f) => f.startsWith("moz-backup-pitr-"));
const containerGone = () =>
  must("docker", ["ps", "-aq", "--filter", "name=^moz-verify-staging-pitr$"]).toString().trim() === ""; // prettier-ignore
const opts = (over: Partial<PitrOptions> = {}): PitrOptions => ({
  env: "staging",
  keyFile: path.join(T, "secret.asc"),
  credentials: READER,
  constants: {
    endpoint: "http://127.0.0.1:9000",
    region: "us-east-1",
    bucket: BUCKET,
    fingerprint: FPR,
  },
  image: IMAGE,
  repoRoot: root,
  target,
  readySeconds: 300,
  ...over,
});

beforeAll(async () => {
  must("docker", ["build", "--platform", "linux/amd64", "-q", "-t", IMAGE, path.join(root, "infra", "postgres")]); // prettier-ignore
  FPR = genKey(GNUPG, "Pitr Test <pitr-test@example.invalid>");
  exportSecret(GNUPG, FPR, path.join(T, "secret.asc"));
  exportSecret(OTHER, genKey(OTHER, "Other <other@example.invalid>"), path.join(T, "other.asc"));

  mkdirSync(CONF, { mode: 0o755 });
  mkdirSync(LEVER_DIR, { mode: 0o755 });
  chmodSync(CONF, 0o755);
  chmodSync(LEVER_DIR, 0o755);
  writeFileSync(path.join(CONF, "public.asc"), must("gpg", ["--homedir", gpgPath(GNUPG), "--armor", "--export", FPR]), { mode: 0o644 }); // prettier-ignore
  writeFileSync(path.join(CONF, "fingerprint"), `${FPR}\n`, { mode: 0o644 });
  writeFileSync(
    path.join(CONF, "walg.env"),
    [
      `AWS_ACCESS_KEY_ID='${WRITER.id}'`,
      `AWS_SECRET_ACCESS_KEY='${WRITER.secret}'`,
      "AWS_ENDPOINT='http://minio:9000'",
      "AWS_REGION='us-east-1'",
      "AWS_S3_FORCE_PATH_STYLE='true'",
      `WALG_S3_PREFIX='s3://${BUCKET}/staging/wal'`,
      "",
    ].join("\n"),
    { mode: 0o644 },
  );

  // A versioned bucket like B2; the host key may list and write, the restore key list and read (all versions).
  const policy = (name: string, actions: string[]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        { Effect: "Allow", Action: ["s3:ListBucket", "s3:ListBucketVersions"], Resource: [`arn:aws:s3:::${BUCKET}`] },
        { Effect: "Allow", Action: actions, Resource: [`arn:aws:s3:::${BUCKET}/*`] },
      ],
      Id: name,
    }); // prettier-ignore
  mc(`{ mc rb --force local/${BUCKET} >/dev/null 2>&1; true; } && mc mb local/${BUCKET} >/dev/null && mc version enable local/${BUCKET} >/dev/null`); // prettier-ignore
  for (const [name, user, secret, actions] of [
    ["pitr-write", WRITER.id, WRITER.secret, ["s3:PutObject"]],
    [
      "pitr-read",
      READER.accessKeyId,
      READER.secretAccessKey,
      ["s3:GetObject", "s3:GetObjectVersion"],
    ],
  ] as const) {
    mc(
      `cat > /tmp/${name}.json && mc admin user add local ${user} ${secret} >/dev/null &&
       mc admin policy create local ${name} /tmp/${name}.json >/dev/null &&
       { mc admin policy attach local ${name} --user ${user} >/dev/null 2>&1 || true; }`,
      policy(name, [...actions]),
    );
  }

  sh("docker", ["rm", "-f", PG]);
  must("docker", [
    "run", "-d", "--name", PG, "--platform", "linux/amd64", "--network", NET, "--user", "999:999",
    "--read-only", "--tmpfs", "/var/run/postgresql:uid=999,gid=999,mode=0775", "--tmpfs", "/tmp:mode=1777",
    "--tmpfs", "/var/lib/postgresql/data:uid=999,gid=999,mode=0700",
    "-v", `${CONF}:/run/moz/walg:ro`, "-v", `${LEVER_DIR}:/run/moz/backup-lever:ro`,
    "-e", "POSTGRES_PASSWORD=not-used", IMAGE,
    "postgres", "-c", "archive_mode=on", "-c", "archive_timeout=60",
    "-c", "archive_command=/usr/local/bin/moz-walg wal-push %p",
  ]); // prettier-ignore
  await until(() => {
    const r = sh("docker", ["logs", PG]);
    return (r.stdout.toString() + r.stderr.toString()).includes("PostgreSQL init process complete") &&
      sh("docker", ["exec", PG, "pg_isready", "-q"]).status === 0;
  }, "Postgres to start", 180_000); // prettier-ignore

  // The real roles, then the migrated app schema (owned in dev by the local superuser "moz").
  const header = ["app", "auth", "worker"]
    .map((r) => `\\set ${r}_password 'pitr-test-${r}'`)
    .join("\n");
  must("docker", ["exec", "-i", "-u", "postgres", PG, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", "postgres"],
    `${header}\n\\set with_umami off\n${readFileSync(path.join(root, "infra", "postgres", "bootstrap.sql"), "utf8")}`); // prettier-ignore
  psql("CREATE ROLE moz NOLOGIN");
  const dump = must("docker", [
    "exec",
    DEV_PG,
    "pg_dump",
    "-Fc",
    "-U",
    "moz",
    "-d",
    templateName(),
  ]);
  must("docker", ["exec", "-i", "-u", "postgres", PG, "pg_restore", "--exit-on-error", "-d", "moz"], dump); // prettier-ignore

  beforeBase = new Date(Date.now() - 1000);
  await archiveNow();
  baseSegment = psql("SELECT pg_walfile_name(pg_current_wal_lsn())");
  const base = sh("docker", [
    "exec",
    "-u",
    "postgres",
    PG,
    "/usr/local/bin/moz-walg",
    "backup-push",
  ]);
  if (base.status !== 0) throw new Error(`backup-push: ${base.stderr.toString().slice(-600)}`);
  startSegment = psql("SELECT pg_walfile_name(pg_current_wal_lsn())");

  psql("CREATE TABLE pitr_probe (v text NOT NULL)");
  psql("INSERT INTO pitr_probe VALUES ('A')");
  await pause(1500);
  target = new Date(Date.now());
  await pause(1500);
  psql("INSERT INTO pitr_probe VALUES ('B')");
  await archiveNow();
}, 900_000);

afterAll(() => {
  sh("docker", ["rm", "-f", PG]);
  sh("gpgconf", ["--homedir", gpgPath(GNUPG), "--kill", "all"]);
  sh("gpgconf", ["--homedir", gpgPath(OTHER), "--kill", "all"]);
  rmSync(T, { recursive: true, force: true });
});

describe("[P0-15] backup:verify --wal: point-in-time restore from the WAL archive (MinIO, real wal-g)", () => {
  it("[P0-15] the archive holds wal-g's fixed set of base backup files, only JSON in clear", () => {
    const keys = mc(`mc ls --recursive local/${BUCKET}/staging/wal/basebackups_005/`).toString().split("\n")
      .map((l) => l.trim().split(/\s+/).pop() ?? "").filter((k) => k !== ""); // prettier-ignore
    const base = keys.find((k) => k.endsWith("_backup_stop_sentinel.json"))?.replace("_backup_stop_sentinel.json", ""); // prettier-ignore
    expect(keys.map((k) => k.replace(base ?? "?", "<base>")).sort()).toEqual([
      "<base>/files_metadata.json",
      "<base>/metadata.json",
      "<base>/tar_partitions/backup_label.tar.zst",
      "<base>/tar_partitions/part_001.tar.zst",
      "<base>/tar_partitions/pg_control.tar.zst",
      "<base>_backup_stop_sentinel.json",
    ]);
  });

  it("[P0-15] restores to the target time: rows before it are there, rows after are not, every check passes; an overwrite is ignored; nothing is left behind", async () => {
    // A second, later version of a segment recovery needs (what a leaked write key could upload).
    await admin.send(new PutObjectCommand({ Bucket: BUCKET, Key: `staging/wal/wal_005/${startSegment}.zst`, Body: encrypt(Buffer.from("not wal")) })); // prettier-ignore
    const before = workDirs().length;
    const lines: string[] = [];
    const result = await verifyPitr(
      opts({ log: (l) => lines.push(l), testQuery: { db: "postgres", sql: "SELECT string_agg(v, ',' ORDER BY v) FROM pitr_probe" } }),
    ); // prettier-ignore
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.testOutput).toBe("A");
    expect(new Date(result.stoppedAt ?? 0).getTime()).toBeGreaterThan(target.getTime());
    expect(result.checks[0]).toMatch(
      /^pitr\|pass\|base base_[0-9A-F]{24} \+ \d+ WAL files replayed to /,
    );
    expect(result.checks.some((l) => /^migrations\|pass\|\d+ applied$/.test(l))).toBe(true);
    expect(result.checks.some((l) => l.startsWith("rls|pass|"))).toBe(true);
    expect(result.checks.at(-1)).toMatch(/^all\|pass\|/);
    expect(
      lines.some((l) => /have more than one version in B2: the oldest of each is used$/.test(l)),
    ).toBe(true);
    expect(lines.some((l) => l.endsWith("every data object is OpenPGP ciphertext"))).toBe(true);
    expect(containerGone()).toBe(true);
    expect(workDirs()).toHaveLength(before);
  }, 600_000);

  it("[P0-15] fails when no base backup finished before the target", async () => {
    const result = await verifyPitr(opts({ target: beforeBase }));
    expect(result.error).toBe(
      `no base backup under staging/wal/ finished before ${beforeBase.toISOString()}`,
    );
  }, 120_000);

  it("[P0-15] fails when the archived WAL ends before the target", async () => {
    psql("SELECT 1"); // nothing after this is committed or archived
    const result = await verifyPitr(opts({ target: new Date() }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/^the archived WAL ends before /);
    expect(containerGone()).toBe(true);
  }, 600_000);

  it("[P0-15] fails when the private key is not the pinned backup key", async () => {
    const result = await verifyPitr(opts({ keyFile: path.join(T, "other.asc") }));
    expect(result.error).toBe(`the private key is not the backup key ${FPR}`);
  }, 300_000);

  it.each([
    ["a WAL object with a flipped byte", () => `staging/wal/wal_005/${startSegment.slice(0, 8)}00000000000000F1.zst`, tampered],
    ["a base backup partition with a flipped byte", () => `staging/wal/basebackups_005/base_${baseSegment}/tar_partitions/part_002.tar.zst`, tampered],
    ["a WAL object without integrity protection", () => `staging/wal/wal_005/${startSegment.slice(0, 8)}00000000000000F2.zst`, () => encrypt(Buffer.from("28b52ffd00", "hex"), ["--rfc2440"])],
  ])("[P0-15] fails on %s (the plaintext gpg already wrote is never used)", async (_what, keyOf, body) => {
    const key = keyOf();
    await admin.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body() }));
    try {
      const result = await verifyPitr(opts());
      expect(result.ok).toBe(false);
      expect(result.error).toBe(`gpg could not decrypt ${key}`);
      expect(containerGone()).toBe(true);
    } finally {
      mc(`mc rm --versions --force local/${BUCKET}/${key} >/dev/null`);
    }
  }, 300_000); // prettier-ignore

  it("[P0-15] fails on a WAL object stored in clear (encryption at rest broken)", async () => {
    const key = `staging/wal/wal_005/${startSegment.slice(0, 8)}00000000000000F0.zst`;
    await admin.send(
      new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: Buffer.from("28b52ffd00", "hex") }),
    );
    try {
      const result = await verifyPitr(opts());
      expect(result.error).toBe(`${key} is not an OpenPGP message`);
    } finally {
      mc(`mc rm --versions --force local/${BUCKET}/${key} >/dev/null`);
    }
  }, 300_000);
});
