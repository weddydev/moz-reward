import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyBackup, type VerifyOptions } from "../../scripts/backup-verify";
import { baseTestUrl, templateName } from "../support/db";

/**
 * P0-15 D3: `pnpm backup:verify` end to end on the dev services. An ephemeral backup key stands in for H-26's;
 * dumps of a cloned test database are encrypted to it and uploaded to MinIO as moz-backup does (sha256 in
 * metadata); a list + read user stands in for the `moz-backups-restore` key. Then verifyBackup downloads, checks,
 * decrypts into the drill's scratch container and runs checks.sql. Failure paths: no dump, too old, tampered,
 * no sha256, not OpenPGP, wrong private key, a restore that fails a check. Same tools as backup-pipeline.
 */
const root = path.resolve(import.meta.dirname, "..", "..");
const PG = "moz-rewards-postgres-1";
const MINIO = "moz-rewards-minio-1";
const ENDPOINT = "http://127.0.0.1:9000";
const BUCKET = "moz-backups-verify-test";
const READER = { accessKeyId: "verifytest01", secretAccessKey: "verify-test-secret-not-real-01" };
const SRC_DB = `moz_verify_src_${String(process.pid)}`;
const ON_WINDOWS = process.platform === "win32";
const T = mkdtempSync(path.join(tmpdir(), "moz-verify-e2e-"));
const GNUPG = path.join(T, "gnupg");
const OTHER = path.join(T, "gnupg-other");
let FPR = "";
let IMAGE = "";

function must(cmd: string, args: string[], input?: Buffer): Buffer {
  const r: SpawnSyncReturns<Buffer> = spawnSync(cmd, args, { input, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0)
    throw new Error(`${cmd} ${args.join(" ")}: ${r.stderr.toString().slice(0, 600)}`);
  return r.stdout;
}
const mc = (command: string, input?: string) =>
  spawnSync(
    "docker",
    [
      "exec",
      "-i",
      MINIO,
      "sh",
      "-c",
      `export MC_CONFIG_DIR=/tmp/.mc-verify-test MC_HOST_local=http://moz:moz-minio-local@127.0.0.1:9000; ${command}`,
    ],
    { input },
  );
const genKey = (home: string, uid: string): string => {
  mkdirSync(home, { mode: 0o700 });
  must("gpg", ["--homedir", home, "--batch", "--pinentry-mode", "loopback", "--passphrase", "", "--quick-gen-key", uid, "default", "default", "never"]); // prettier-ignore
  const colons = must("gpg", ["--homedir", home, "--with-colons", "--list-keys"]).toString();
  return /^fpr:+([0-9A-F]{40}):/m.exec(colons)?.[1] ?? "";
};
const exportSecret = (home: string, fpr: string, file: string) => { writeFileSync(file, must("gpg", ["--homedir", home, "--batch", "--pinentry-mode", "loopback", "--passphrase", "", "--armor", "--export-secret-keys", fpr])); }; // prettier-ignore

const admin = new S3Client({
  endpoint: ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: "moz", secretAccessKey: "moz-minio-local" },
});
const pgAdmin = postgres(
  (() => {
    const u = new URL(baseTestUrl());
    u.pathname = "/postgres";
    return u.toString();
  })(),
  { max: 1, onnotice: () => {} },
);

const dump = (): Buffer =>
  must("docker", ["exec", "-i", PG, "pg_dump", "-Fc", "-U", "moz", "-d", SRC_DB]);
const encrypt = (plain: Buffer): Buffer =>
  must("gpg", ["--homedir", GNUPG, "--batch", "--trust-model", "always", "--compress-algo", "none", "--recipient", FPR, "--encrypt", "--output", "-"], plain); // prettier-ignore
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const stampOf = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const keyFor = (d: Date) =>
  `staging/dumps/${d.toISOString().slice(0, 10)}/moz-${stampOf(d)}.dump.gpg`;
async function upload(
  at: Date,
  body: Buffer,
  meta: Record<string, string> = { sha256: sha256(body) },
) {
  await admin.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: keyFor(at), Body: body, Metadata: meta }),
  );
  return keyFor(at);
}
const hoursAgo = (h: number) => new Date(Math.floor((Date.now() - h * 3_600_000) / 1000) * 1000);
const workDirs = () => readdirSync(tmpdir()).filter((f) => f.startsWith("moz-backup-verify-"));

const opts = (over: Partial<VerifyOptions> = {}): VerifyOptions => ({
  env: "staging",
  keyFile: path.join(T, "secret.asc"),
  credentials: READER,
  constants: { endpoint: ENDPOINT, region: "us-east-1", bucket: BUCKET, fingerprint: FPR },
  image: IMAGE,
  repoRoot: root,
  maxAgeHours: 26,
  readySeconds: 120,
  // The dev database belongs to the local superuser "moz"; staging's objects belong to bootstrap's roles.
  testPrelude: `eval "orig_$(declare -f drill_bootstrap)"
drill_bootstrap() { orig_drill_bootstrap "$@"; scratch_psql -d postgres -c 'CREATE ROLE moz NOLOGIN' >/dev/null; }`,
  ...over,
});

let cipher: Buffer = Buffer.alloc(0);

beforeAll(async () => {
  if (ON_WINDOWS) return;
  FPR = genKey(GNUPG, "Verify Test <verify-test@example.invalid>");
  exportSecret(GNUPG, FPR, path.join(T, "secret.asc"));
  const other = genKey(OTHER, "Other <other@example.invalid>");
  exportSecret(OTHER, other, path.join(T, "other.asc"));
  IMAGE = must("docker", ["inspect", "-f", "{{.Config.Image}}", PG]).toString().trim();

  await pgAdmin.unsafe(`CREATE DATABASE ${SRC_DB} TEMPLATE ${templateName()}`);
  cipher = encrypt(dump());

  // MinIO: the bucket and a user that may only list and read, like the moz-backups-restore key.
  const policy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      { Effect: "Allow", Action: ["s3:ListBucket"], Resource: [`arn:aws:s3:::${BUCKET}`] },
      { Effect: "Allow", Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${BUCKET}/*`] },
    ],
  });
  const setup = mc(
    `cat > /tmp/verify-test-policy.json && mc mb --ignore-existing local/${BUCKET} >/dev/null &&
     mc admin user add local ${READER.accessKeyId} ${READER.secretAccessKey} >/dev/null &&
     mc admin policy create local backup-read-list /tmp/verify-test-policy.json >/dev/null &&
     { mc admin policy attach local backup-read-list --user ${READER.accessKeyId} >/dev/null 2>&1 || true; }`,
    policy,
  );
  if (setup.status !== 0) throw new Error(`MinIO setup failed: ${setup.stderr.toString()}`);
}, 120_000);

beforeEach(() => {
  if (ON_WINDOWS) return;
  mc(`mc rm --recursive --force local/${BUCKET}/staging/ >/dev/null 2>&1; true`);
});

afterAll(async () => {
  if (ON_WINDOWS) return;
  await pgAdmin.unsafe(`DROP DATABASE IF EXISTS ${SRC_DB} WITH (FORCE)`);
  await pgAdmin.end();
  rmSync(T, { recursive: true, force: true });
});

const containerGone = () =>
  must("docker", ["ps", "-aq", "--filter", "name=^moz-verify-staging-drill$"]).toString().trim() ===
  "";

describe.skipIf(ON_WINDOWS)("[P0-15] backup:verify end to end (dev Postgres + MinIO)", () => {
  it("[P0-15] the newest dump downloads, matches its sha256, decrypts, restores and passes every check; nothing is left behind", async () => {
    const before = workDirs().length;
    await upload(hoursAgo(30), Buffer.from("older, never read"), { sha256: "0".repeat(64) });
    const key = await upload(hoursAgo(0), cipher);
    const lines: string[] = [];
    const result = await verifyBackup(opts({ log: (l) => lines.push(l) }));
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(lines[0]).toMatch(
      new RegExp(
        `^downloaded ${key.replaceAll(".", "\\.")} \\(\\d+ bytes, 0\\.0 h old, sha256 matches\\)$`,
      ),
    );
    expect(result.checks[0]).toMatch(/^migrations\|pass\|\d+ applied$/);
    expect(result.checks.some((l) => l.startsWith("rls|pass|"))).toBe(true);
    expect(result.checks.at(-1)).toMatch(/^all\|pass\|/);
    expect(containerGone()).toBe(true);
    expect(workDirs()).toHaveLength(before);
  }, 240_000);

  it("[P0-15] fails when there is no dump", async () => {
    expect(await verifyBackup(opts())).toEqual({
      ok: false,
      checks: [],
      error: "no moz dump under staging/dumps/",
    });
  });

  it("[P0-15] fails when the newest dump is older than --max-age-hours", async () => {
    await upload(hoursAgo(0), cipher);
    // The age comes from the server's upload time, so move the clock instead of back-dating the name.
    const result = await verifyBackup(
      opts({ now: new Date(Date.now() + 27 * 3_600_000 + 60_000) }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/is 27\.0 h old, more than 26 h$/);
  });

  it("[P0-15] refuses a dump named in the future (it would stay newest for ever) or far from its upload time", async () => {
    await upload(hoursAgo(-2), cipher);
    expect((await verifyBackup(opts())).error).toMatch(/is named after a time in the future$/);
    mc(`mc rm --recursive --force local/${BUCKET}/staging/ >/dev/null 2>&1; true`);
    await upload(hoursAgo(2), cipher);
    expect((await verifyBackup(opts())).error).toMatch(/more than 1 h from the time in its name$/);
  });

  it("[P0-15] removes what a killed run left behind (key directory, scratch container) before starting", async () => {
    const stale = mkdtempSync(path.join(tmpdir(), "moz-backup-verify-"));
    mkdirSync(path.join(stale, "gnupg"), { mode: 0o700 });
    writeFileSync(path.join(stale, "moz.dump.gpg"), "left over");
    must("docker", ["run", "-d", "--name", "moz-verify-staging-drill", "--network", "none", "--entrypoint", "sleep", IMAGE, "300"]); // prettier-ignore
    await verifyBackup(opts());
    expect(readdirSync(tmpdir())).not.toContain(path.basename(stale));
    expect(containerGone()).toBe(true);
  });

  it("[P0-15] fails before decrypting when the object differs from the sha256 recorded at upload", async () => {
    const tampered = Buffer.concat([cipher.subarray(0, cipher.length - 1), Buffer.from([0])]);
    await upload(hoursAgo(0), tampered, { sha256: sha256(cipher) });
    const result = await verifyBackup(opts());
    expect(result.error).toMatch(/does not match the sha256 recorded at upload$/);
  });

  it("[P0-15] fails when no sha256 was recorded", async () => {
    await upload(hoursAgo(0), cipher, {});
    expect((await verifyBackup(opts())).error).toMatch(/has no sha256 recorded at upload$/);
  });

  it("[P0-15] fails on a plaintext pg_dump archive", async () => {
    await upload(hoursAgo(0), dump());
    expect((await verifyBackup(opts())).error).toMatch(/is not an OpenPGP message$/);
  });

  it("[P0-15] fails when the private key is not the pinned backup key", async () => {
    await upload(hoursAgo(0), cipher);
    const result = await verifyBackup(opts({ keyFile: path.join(T, "other.asc") }));
    expect(result.error).toBe(`the private key is not the backup key ${FPR}`);
  });

  it("[P0-15] fails with the read-only key's 403 when the credentials are wrong", async () => {
    await upload(hoursAgo(0), cipher);
    const result = await verifyBackup(
      opts({
        credentials: {
          accessKeyId: READER.accessKeyId,
          secretAccessKey: "wrong-secret-0000000000",
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/^B2\/S3: /);
  });

  it("[P0-15] a restore that fails checks.sql fails and removes the scratch container", async () => {
    const src = postgres(
      (() => {
        const u = new URL(baseTestUrl());
        u.pathname = `/${SRC_DB}`;
        return u.toString();
      })(),
      { max: 1, onnotice: () => {} },
    );
    await src.unsafe("ALTER TABLE shops NO FORCE ROW LEVEL SECURITY");
    const broken = encrypt(dump());
    await src.unsafe("ALTER TABLE shops FORCE ROW LEVEL SECURITY");
    await src.end();
    await upload(hoursAgo(0), broken);
    const result = await verifyBackup(opts());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/backup check failed: rls \(missing on shops\)/);
    expect(containerGone()).toBe(true);
  }, 240_000);
});
