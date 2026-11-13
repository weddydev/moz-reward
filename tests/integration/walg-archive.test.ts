import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * P0-15 D2, end to end: the staging/production Postgres image (infra/postgres, wal-g + moz-walg) archives WAL and
 * takes a base backup into MinIO as a user that may only list and write (B2's host keys have no read or delete,
 * H-42). Proves design check HIGH 2: every data object is OpenPGP ciphertext to the pinned public key (the
 * container never has the private half), decrypts to zstd, and a marker planted in a table appears in no stored
 * object; and HIGH 3: the archive-off lever stops uploads without failing archive_command, and a wrong pinned
 * key stops them with a failure pg_stat_archiver reports.
 *
 * Needs Docker (MinIO from `pnpm services:up`; the image is linux/amd64, emulated on Apple silicon) and gpg.
 */
const root = path.resolve(import.meta.dirname, "..", "..");
const MINIO = "moz-rewards-minio-1";
const NET = "moz-rewards_default";
const IMAGE = "moz-postgres:walg-test";
const PG = `moz-walg-test-${String(process.pid)}`;
const BUCKET = "moz-walg-test";
const KEY_ID = "walgtest01";
const SECRET = "walg-test-secret-not-real-0001";
const MARKER = "moz-walg-plaintext-marker-7f3c";
const T = mkdtempSync(path.join(tmpdir(), "moz-walg-e2e-"));
const CONF = path.join(T, "conf");
const LEVER_DIR = path.join(T, "lever");
const GNUPG = path.join(T, "g");
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
const mc = (command: string, input?: string | Buffer): Buffer =>
  must(
    "docker",
    [
      "exec",
      "-i",
      MINIO,
      "sh",
      "-c",
      `export MC_CONFIG_DIR=/tmp/.mc-walg-test MC_HOST_local=http://moz:moz-minio-local@127.0.0.1:9000; ${command}`,
    ],
    input,
  );
const psql = (sql: string): string =>
  must("docker", ["exec", "-u", "postgres", PG, "psql", "-X", "-A", "-t", "-c", sql])
    .toString()
    .trim();
const archiver = (): { archived: number; failed: number } => {
  const [archived, failed] = psql(
    "SELECT archived_count, failed_count FROM pg_stat_archiver",
  ).split("|");
  return { archived: Number(archived), failed: Number(failed) };
};
/** Every object under the prefix (admin listing), as key names. */
const objects = (prefix: string): string[] =>
  mc(`mc ls --recursive local/${BUCKET}/${prefix}`)
    .toString()
    .split("\n")
    .map((l) => l.trim().split(/\s+/).pop() ?? "")
    .filter((k) => k !== "")
    .map((k) => `${prefix}${k}`);
const read = (key: string): Buffer => mc(`mc cat local/${BUCKET}/${key}`);

async function until(check: () => boolean, what: string, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${what}`);
}
/** The container's log, both streams (the image's entrypoint prints to stdout, the server to stderr). */
const logs = (): string => {
  const r = sh("docker", ["logs", PG]);
  return r.stdout.toString() + r.stderr.toString();
};
const writeConf = (pinned: string): void => {
  writeFileSync(path.join(CONF, "fingerprint"), `${pinned}\n`, { mode: 0o644 });
};

beforeAll(async () => {
  must("gpg", ["--version"]);
  must("docker", [
    "build",
    "--platform",
    "linux/amd64",
    "-q",
    "-t",
    IMAGE,
    path.join(root, "infra", "postgres"),
  ]);

  // Ephemeral backup key: the container gets the public half only.
  mkdirSync(GNUPG, { mode: 0o700 });
  must("gpg", [
    "--homedir", GNUPG, "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
    "--quick-gen-key", "Walg Test <walg-test@example.invalid>", "default", "default", "never",
  ]); // prettier-ignore
  FPR = /^fpr:+([0-9A-F]{40}):/m.exec(must("gpg", ["--homedir", GNUPG, "--with-colons", "--list-keys"]).toString())?.[1] ?? ""; // prettier-ignore
  mkdirSync(CONF, { mode: 0o755 });
  mkdirSync(LEVER_DIR, { mode: 0o755 });
  chmodSync(CONF, 0o755);
  chmodSync(LEVER_DIR, 0o755);
  writeFileSync(path.join(CONF, "public.asc"), must("gpg", ["--homedir", GNUPG, "--armor", "--export", FPR]), { mode: 0o644 }); // prettier-ignore
  writeConf(FPR);
  writeFileSync(
    path.join(CONF, "walg.env"),
    [
      `AWS_ACCESS_KEY_ID='${KEY_ID}'`,
      `AWS_SECRET_ACCESS_KEY='${SECRET}'`,
      "AWS_ENDPOINT='http://minio:9000'",
      "AWS_REGION='us-east-1'",
      "AWS_S3_FORCE_PATH_STYLE='true'",
      `WALG_S3_PREFIX='s3://${BUCKET}/staging/wal'`,
      "",
    ].join("\n"),
    { mode: 0o644 },
  );

  // List + write only, like the B2 host key.
  const policy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      { Effect: "Allow", Action: ["s3:ListBucket"], Resource: [`arn:aws:s3:::${BUCKET}`] },
      { Effect: "Allow", Action: ["s3:PutObject"], Resource: [`arn:aws:s3:::${BUCKET}/*`] },
    ],
  });
  mc(
    `cat > /tmp/walg-test-policy.json && mc rb --force local/${BUCKET} >/dev/null 2>&1; mc mb local/${BUCKET} >/dev/null &&
     mc admin user add local ${KEY_ID} ${SECRET} >/dev/null &&
     mc admin policy create local walg-write-list /tmp/walg-test-policy.json >/dev/null &&
     { mc admin policy attach local walg-write-list --user ${KEY_ID} >/dev/null 2>&1 || true; }`,
    policy,
  );

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
  await until(
    () =>
      logs().includes("PostgreSQL init process complete") &&
      sh("docker", ["exec", PG, "pg_isready", "-q"]).status === 0,
    "Postgres to start",
    180_000,
  );
}, 600_000);

afterAll(() => {
  sh("docker", ["rm", "-f", PG]);
  sh("gpgconf", ["--homedir", GNUPG, "--kill", "all"]);
  rmSync(T, { recursive: true, force: true });
});

describe("[P0-15] WAL archiving and base backups through moz-walg (production image, MinIO)", () => {
  it("[P0-15] archives WAL and takes a base backup with a list+write-only key; every data object is OpenPGP to the pinned key and holds no plaintext", async () => {
    psql(
      `CREATE TABLE secret_rows AS SELECT '${MARKER}' || g AS v FROM generate_series(1, 20000) g`,
    );
    psql("SELECT pg_switch_wal()");
    await until(() => archiver().archived >= 1, "the first archived segment");
    const base = sh("docker", [
      "exec",
      "-u",
      "postgres",
      PG,
      "/usr/local/bin/moz-walg",
      "backup-push",
    ]);
    expect(base.status, base.stderr.toString().slice(-600)).toBe(0);

    const keys = objects("staging/wal/");
    const data = keys.filter((k) => k.endsWith(".zst"));
    expect(keys.some((k) => k.startsWith("staging/wal/wal_005/"))).toBe(true);
    expect(data.some((k) => k.includes("basebackups_005/") && k.includes("tar_partitions/"))).toBe(
      true,
    );
    // Everything else is wal-g's own metadata (LSNs, file names and sizes): JSON, never table contents.
    expect(keys.filter((k) => !k.endsWith(".zst")).every((k) => k.endsWith(".json"))).toBe(true);

    for (const key of keys) {
      const body = read(key);
      expect(body.includes(MARKER), key).toBe(false);
    }
    for (const key of data) {
      const body = read(key);
      // New-format PKESK (0xC1) or old-format (0x84-0x87): a message encrypted to a public key.
      const first = body[0] ?? 0;
      expect(first === 0xc1 || (first >= 0x84 && first <= 0x87), key).toBe(true);
      const plain = must("gpg", ["--homedir", GNUPG, "--batch", "--quiet", "--decrypt"], body);
      expect(plain.subarray(0, 4).toString("hex"), key).toBe("28b52ffd"); // zstd frame
    }
  }, 300_000);

  it("[P0-15] the archive-off lever: segments are reported archived but nothing is uploaded; a base backup is refused", async () => {
    const before = objects("staging/wal/wal_005/").length;
    const { archived } = archiver();
    writeFileSync(path.join(LEVER_DIR, "archive-off"), "", { mode: 0o644 });
    try {
      psql("CREATE TABLE lever_rows AS SELECT g FROM generate_series(1, 1000) g");
      psql("SELECT pg_switch_wal()");
      await until(() => archiver().archived > archived, "the segment to be passed over");
      expect(objects("staging/wal/wal_005/").length).toBe(before);
      const base = sh("docker", [
        "exec",
        "-u",
        "postgres",
        PG,
        "/usr/local/bin/moz-walg",
        "backup-push",
      ]);
      expect(base.status).toBe(1);
      expect(base.stderr.toString()).toContain("archive-off lever is set");
    } finally {
      rmSync(path.join(LEVER_DIR, "archive-off"), { force: true });
    }
  }, 120_000);

  it("[P0-15] a pinned fingerprint that doesn't match the key stops archiving with a failure pg_stat_archiver reports", async () => {
    const before = objects("staging/wal/wal_005/").length;
    const { failed } = archiver();
    writeConf("0".repeat(40));
    try {
      psql("CREATE TABLE pin_rows AS SELECT g FROM generate_series(1, 1000) g");
      psql("SELECT pg_switch_wal()");
      await until(() => archiver().failed > failed, "the archive failure");
      expect(objects("staging/wal/wal_005/").length).toBe(before);
      expect(logs()).toContain("not the pinned");
    } finally {
      writeConf(FPR);
    }
    // Restored pin: Postgres retries the same segment and it goes up.
    await until(
      () => objects("staging/wal/wal_005/").length > before,
      "the retried segment",
      90_000,
    );
  }, 180_000);
});
