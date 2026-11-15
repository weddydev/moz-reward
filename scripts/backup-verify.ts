/**
 * `pnpm backup:verify` (P0-15 D3, H-29): proves on a developer's laptop that the newest encrypted backup in B2
 * can really be restored. The host never holds the private key, so this is the only proof of decryptability.
 *
 *   export B2_RESTORE_KEY_ID=… B2_RESTORE_KEY=…      # read-only `moz-backups-restore` key, this shell only
 *   pnpm backup:verify --key-file <private key .asc | -> [--env staging|production] [--max-age-hours 26]
 *     [--disk-encrypted]   (production only, where the disk can't be checked: Windows/BitLocker)
 *
 * Steps: list `<env>/dumps/`, take the newest dump of each database (moz; production also umami) and fail if it is
 * older than --max-age-hours; download into a 0700 temp dir checking size, the `x-amz-meta-sha256` the host
 * recorded and the OpenPGP header; import the private key into a throwaway GNUPGHOME and require the pinned
 * fingerprint; then, in the restore drill's own scratch Postgres (`--network none`, tmpfs data, from
 * infra/host/moz-backup), bootstrap roles, `gpg --decrypt | pg_restore` (no plaintext file) and run
 * infra/backup/checks.sql. Prints `check|pass|detail` lines and PASS/FAIL. The container, the agent, the
 * downloads and the GNUPGHOME are removed on every exit, Ctrl-C included.
 *
 * Bucket, region, endpoint and fingerprint come from infra/host/moz-backup (one source); the CLI takes no
 * overrides. Real customer data is decrypted here: run it only on an encrypted disk (DPIA/ROPA note, SECURITY §11).
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { findBash } from "./lib/find-bash";

export type BackupEnv = "staging" | "production";

export interface BackupConstants {
  endpoint: string;
  region: string;
  bucket: string;
  fingerprint: string;
}

/** The fixed values in infra/host/moz-backup (`S3_ENDPOINT=…` lines). */
export function readBackupConstants(script: string): BackupConstants {
  const value = (name: string, pattern: RegExp): string => {
    const line = script.split("\n").find((l) => l.startsWith(`${name}=`)) ?? "";
    const found = line.slice(name.length + 1);
    if (!pattern.test(found))
      throw new Error(`infra/host/moz-backup: ${name} is missing or malformed`);
    return found;
  };
  return {
    endpoint: value("S3_ENDPOINT", /^https:\/\/[a-z0-9.-]+$/),
    region: value("S3_REGION", /^[a-z0-9-]+$/),
    bucket: value("S3_BUCKET", /^[a-z0-9-]{3,63}$/),
    fingerprint: value("PUBKEY_FPR", /^[0-9A-F]{40}$/),
  };
}

export const databasesFor = (env: BackupEnv): string[] =>
  env === "production" ? ["moz", "umami"] : ["moz"];

export interface Dump {
  db: string;
  key: string;
  /** From the object name (written by the host, so not trusted on its own). */
  takenAt: Date;
  /** The server's LastModified from the listing: what the age is measured from. */
  uploadedAt?: Date | undefined;
}

export interface Listed {
  key: string;
  lastModified?: Date | undefined;
}

/** The newest dump per database among object keys `<env>/dumps/<YYYY-MM-DD>/<db>-<YYYYMMDDTHHMMSSZ>.dump.gpg`. */
export function newestDumps(objects: Listed[], env: BackupEnv): Map<string, Dump> {
  const pattern =
    /^(staging|production)\/dumps\/\d{4}-\d{2}-\d{2}\/([a-z]+)-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.dump\.gpg$/;
  const newest = new Map<string, Dump>();
  for (const { key, lastModified } of objects) {
    const m = pattern.exec(key);
    if (m?.[1] !== env) continue;
    const [, , db = "", y, mo, d, h, mi, s] = m;
    const takenAt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
    if (Number.isNaN(takenAt.getTime())) continue;
    const seen = newest.get(db);
    if (!seen || takenAt > seen.takenAt)
      newest.set(db, { db, key, takenAt, uploadedAt: lastModified });
  }
  return newest;
}

const FUTURE_SLACK_MS = 10 * 60_000;
const NAME_VS_UPLOAD_MS = 60 * 60_000;

/**
 * Null when the dump is fresh enough, else why not. The age comes from the server's upload time, and the name must
 * agree with it: a write key can upload a dump named in the future that would otherwise stay "newest" for ever.
 */
export function dumpTimeProblem(dump: Dump, now: Date, maxAgeHours: number): string | null {
  if (dump.takenAt.getTime() > now.getTime() + FUTURE_SLACK_MS) {
    return `${dump.key} is named after a time in the future`;
  }
  if (!dump.uploadedAt) return `${dump.key} has no upload time in the listing`;
  if (Math.abs(dump.uploadedAt.getTime() - dump.takenAt.getTime()) > NAME_VS_UPLOAD_MS) {
    return `${dump.key} was uploaded at ${dump.uploadedAt.toISOString()}, more than 1 h from the time in its name`;
  }
  const ageHours = (now.getTime() - dump.uploadedAt.getTime()) / 3_600_000;
  if (ageHours > maxAgeHours) {
    return `the newest ${dump.db} dump (${dump.key}) is ${ageHours.toFixed(1)} h old, more than ${String(maxAgeHours)} h`;
  }
  return null;
}

/**
 * What a failed restore may print: only our own messages (`moz-backup: …` from die, `backup check failed: …`
 * from checks.sql, whose details are names and counts). Postgres' DETAIL/CONTEXT/COPY lines can quote row values
 * (emails, phone numbers), so they never reach the output.
 */
export function failureReason(stderr: string, status: number | null): string {
  const check = /backup check failed: [^\n]*/.exec(stderr)?.[0];
  if (check) return check.trim();
  const ours = stderr
    .split("\n")
    .filter((line) => line.startsWith("moz-backup: "))
    .at(-1);
  return ours
    ? ours.slice("moz-backup: ".length).trim()
    : `the restore failed (exit ${String(status)})`;
}

/** OpenPGP message, first packet a PKESK (old format 0x84–0x87 or new 0xC1), as moz-backup's is_openpgp. */
export const isOpenPgp = (first: number | undefined): boolean =>
  first !== undefined && ((first >= 0x84 && first <= 0x87) || first === 0xc1);

export interface VerifyOptions {
  env: BackupEnv;
  keyFile: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  constants: BackupConstants;
  /** Postgres image for the scratch container (the CLI uses the dev services' image). */
  image: string;
  repoRoot: string;
  maxAgeHours: number;
  now?: Date;
  readySeconds?: number;
  log?: (line: string) => void;
  /** Tests only: bash run right after moz-backup is sourced (e.g. a role the dev database's owner needs). */
  testPrelude?: string;
}

export interface VerifyResult {
  ok: boolean;
  checks: string[];
  error?: string;
}

class VerifyError extends Error {}
const fail = (message: string): never => {
  throw new VerifyError(message);
};

function gpg(home: string, args: string[], input?: Buffer) {
  return spawnSync("gpg", ["--homedir", home, "--batch", ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

/** Imports the key and returns the fingerprints that have a secret part. */
function importKey(home: string, keyFile: string): string[] {
  const material = keyFile === "-" ? readFileSync(0) : readFileSync(keyFile);
  const imported = gpg(home, ["--quiet", "--import"], material);
  if (imported.status !== 0) fail("the private key could not be imported");
  const listed = gpg(home, ["--with-colons", "--list-secret-keys"]);
  if (listed.status !== 0) fail("the private key could not be read back");
  const fprs: string[] = [];
  let inSecret = false;
  for (const line of listed.stdout.split("\n")) {
    const fields = line.split(":");
    if (fields[0] === "sec" || fields[0] === "ssb") inSecret = true;
    else if (fields[0] === "fpr" && inSecret) {
      fprs.push(fields[9] ?? "");
      inSecret = false;
    } else if (fields[0] !== "grp") inSecret = false;
  }
  return fprs;
}

async function download(
  s3: S3Client,
  bucket: string,
  key: string,
  file: string,
): Promise<{ size: number; first: number | undefined }> {
  const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const recorded = got.Metadata?.sha256 ?? "";
  if (!/^[0-9a-f]{64}$/.test(recorded)) fail(`${key} has no sha256 recorded at upload`);
  if (!got.Body) fail(`${key} has no body`);
  const hash = createHash("sha256");
  let size = 0;
  let first: number | undefined;
  const tap = new Transform({
    transform(chunk: Buffer, _enc, done) {
      if (size === 0) first = chunk[0];
      size += chunk.length;
      hash.update(chunk);
      done(null, chunk);
    },
  });
  await pipeline(got.Body as Readable, tap, createWriteStream(file, { mode: 0o600 }));
  if (got.ContentLength !== undefined && got.ContentLength !== size) {
    fail(`${key}: downloaded ${String(size)} bytes, expected ${String(got.ContentLength)}`);
  }
  if (hash.digest("hex") !== recorded) fail(`${key} does not match the sha256 recorded at upload`);
  return { size, first };
}

function pick(env: NodeJS.ProcessEnv, names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = env[name];
    if (value !== undefined) out[name] = value;
  }
  return out;
}

// Runs in bash with infra/host/moz-backup sourced: the drill's scratch container and bootstrap, then
// gpg → pg_restore per database and checks.sql. stdout carries only the check lines.
const RESTORE = String.raw`set -Eeuo pipefail
source "$SCRIPT"
eval "$TEST_PRELUDE"
DRILL_READY_SECONDS=$READY
trap 'docker rm -f "$DRILL_CONTAINER" >/dev/null 2>&1 || true' EXIT
# With the key piped in (pbpaste | …) stdin is not a terminal: pinentry then asks on the controlling one.
GPG_TTY=$(tty 2>/dev/null) || GPG_TTY=$( (: </dev/tty) 2>/dev/null && echo /dev/tty || true)
export GPG_TTY
start_scratch "verify-$VERIFY_ENV" "$IMAGE"
drill_bootstrap "$VERIFY_ENV" "$INFRA"
for db in $DBS; do
  set +e
  gpg --homedir "$GNUPGHOME" --batch --quiet --decrypt "$VERIFY_WORK/$db.dump.gpg" |
    docker exec -i "$DRILL_CONTAINER" pg_restore --exit-on-error --single-transaction -d "$db"
  st=("${"$"}{PIPESTATUS[@]}")
  set -e
  ((st[0] == 0)) || die "gpg could not decrypt the $db dump (exit ${"$"}{st[0]})"
  ((st[1] == 0)) || die "pg_restore of $db failed (exit ${"$"}{st[1]})"
done
scratch_psql -d moz <"$INFRA/backup/checks.sql"`;

function restore(
  o: VerifyOptions,
  bash: string,
  work: string,
  home: string,
  dbs: string[],
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bash, ["-c", RESTORE], {
      // stdin stays the terminal so gpg-agent's pinentry can ask for the key's passphrase.
      stdio: ["inherit", "pipe", "pipe"],
      // An allowlist, not the caller's environment: no B2 key, no BASH_ENV or exported bash functions.
      env: {
        ...pick(process.env, [
          "PATH",
          "HOME",
          "TMPDIR",
          "TERM",
          "LANG",
          "LC_ALL",
          "DOCKER_HOST",
          "DOCKER_CONTEXT",
          "DOCKER_CONFIG",
        ]),
        NODE_ENV: "production",
        SCRIPT: path.join(o.repoRoot, "infra", "host", "moz-backup"),
        INFRA: path.join(o.repoRoot, "infra"),
        VERIFY_ENV: o.env,
        IMAGE: o.image,
        READY: String(o.readySeconds ?? 180),
        DBS: dbs.join(" "),
        VERIFY_WORK: work,
        GNUPGHOME: home,
        // Always set: never taken from the caller's environment.
        TEST_PRELUDE: o.testPrelude ?? "",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => (stdout += b.toString()));
    child.stderr.on("data", (b: Buffer) => (stderr += b.toString()));
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

const WORK_PREFIX = "moz-backup-verify-";

function removeRun(work: string, container: string): void {
  spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  // gpg ≥ 2.4 may start keyboxd as well as gpg-agent in a new homedir.
  spawnSync("gpgconf", ["--homedir", path.join(work, "gnupg"), "--kill", "all"], {
    stdio: "ignore",
  });
  rmSync(work, { recursive: true, force: true });
}

export function removeLeftovers(container: string): void {
  for (const name of readdirSync(tmpdir())) {
    if (name.startsWith(WORK_PREFIX)) removeRun(path.join(tmpdir(), name), container);
  }
  spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}

export async function verifyBackup(o: VerifyOptions): Promise<VerifyResult> {
  const log = o.log ?? (() => {});
  const now = o.now ?? new Date();
  const dbs = databasesFor(o.env);
  const container = `moz-verify-${o.env}-drill`;
  // A run killed hard (SIGKILL, power loss) leaves its key, agent and container: remove them first.
  removeLeftovers(container);
  const work = mkdtempSync(path.join(tmpdir(), WORK_PREFIX));
  const home = path.join(work, "gnupg");
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    removeRun(work, container);
  };
  const onSignal = (signal: NodeJS.Signals) => {
    cleanup();
    process.exit(signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143);
  };
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  // on, not once: a second Ctrl-C during cleanup must not kill the process half-way.
  for (const signal of signals) process.on(signal, onSignal);
  try {
    let bash: string;
    try {
      bash = findBash();
    } catch (e) {
      return fail((e as Error).message);
    }
    mkdirSync(home, { mode: 0o700 });
    const s3 = new S3Client({
      endpoint: o.constants.endpoint,
      region: o.constants.region,
      forcePathStyle: true,
      credentials: o.credentials,
    });

    const objects: Listed[] = [];
    let token: string | undefined;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({
          Bucket: o.constants.bucket,
          Prefix: `${o.env}/dumps/`,
          ContinuationToken: token,
        }),
      );
      for (const item of page.Contents ?? []) {
        if (item.Key) objects.push({ key: item.Key, lastModified: item.LastModified });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    const newest = newestDumps(objects, o.env);

    for (const db of dbs) {
      const dump = newest.get(db) ?? fail(`no ${db} dump under ${o.env}/dumps/`);
      const problem = dumpTimeProblem(dump, now, o.maxAgeHours);
      if (problem) fail(problem);
      const ageHours = (now.getTime() - (dump.uploadedAt ?? dump.takenAt).getTime()) / 3_600_000;
      const { size, first } = await download(
        s3,
        o.constants.bucket,
        dump.key,
        path.join(work, `${db}.dump.gpg`),
      );
      if (!isOpenPgp(first)) fail(`${dump.key} is not an OpenPGP message`);
      log(
        `downloaded ${dump.key} (${String(size)} bytes, ${ageHours.toFixed(1)} h old, sha256 matches)`,
      );
    }

    const fprs = importKey(home, o.keyFile);
    if (!fprs.includes(o.constants.fingerprint)) {
      fail(`the private key is not the backup key ${o.constants.fingerprint}`);
    }
    log(`private key ${o.constants.fingerprint} imported into a throwaway GNUPGHOME`);

    const r = await restore(o, bash, work, home, dbs);
    const checks = r.stdout.split("\n").filter((line) => /^[a-z_]+\|pass\|/.test(line));
    if (r.status !== 0) {
      return { ok: false, checks, error: failureReason(r.stderr, r.status) };
    }
    if (!checks.at(-1)?.startsWith("all|pass|")) {
      return { ok: false, checks, error: "checks.sql did not report a pass" };
    }
    return { ok: true, checks };
  } catch (e) {
    if (e instanceof VerifyError) return { ok: false, checks: [], error: e.message };
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, checks: [], error: `B2/S3: ${message}` };
  } finally {
    for (const signal of signals) process.removeListener(signal, onSignal);
    cleanup();
  }
}

interface Args {
  env: BackupEnv;
  keyFile: string;
  maxAgeHours: number;
  diskEncrypted: boolean;
}

function parseArgs(argv: string[]): Args {
  let env: BackupEnv = "staging";
  let diskEncrypted = false;
  let keyFile = "";
  let maxAgeHours = 26;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i] ?? "";
    if (arg === "--env") {
      const v = next();
      if (v !== "staging" && v !== "production")
        throw new Error("--env must be staging or production");
      env = v;
    } else if (arg === "--key-file") keyFile = next();
    else if (arg === "--disk-encrypted") diskEncrypted = true;
    else if (arg === "--max-age-hours") {
      maxAgeHours = Number(next());
      if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0)
        throw new Error("--max-age-hours must be a positive number");
    } else throw new Error(`unknown argument ${String(arg)}`);
  }
  if (!keyFile) throw new Error("--key-file <private key .asc, or - for stdin> is required");
  return { env, keyFile, maxAgeHours, diskEncrypted };
}

/** FileVault on (macOS) or a LUKS device (Linux). Other systems can't be checked without admin rights. */
function diskIsEncrypted(): boolean {
  if (process.platform === "darwin") {
    const r = spawnSync("fdesetup", ["isactive"], { encoding: "utf8" });
    return r.status === 0 && r.stdout.trim() === "true";
  }
  if (process.platform === "linux") {
    const r = spawnSync("lsblk", ["-rno", "TYPE"], { encoding: "utf8" });
    return r.status === 0 && r.stdout.split("\n").includes("crypt");
  }
  return false;
}

const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function main(): Promise<number> {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`backup:verify: ${(e as Error).message}`);
    return 64;
  }
  // Production holds real customer data: only onto an encrypted disk (DPIA/ROPA, C-45).
  if (args.env === "production" && !diskIsEncrypted() && !args.diskEncrypted) {
    console.error(
      "backup:verify: --env production decrypts customer data: this disk is not shown as encrypted (macOS: FileVault on; Linux: a LUKS volume). On Windows with BitLocker on, add --disk-encrypted",
    );
    return 64;
  }
  const accessKeyId = process.env.B2_RESTORE_KEY_ID ?? "";
  const secretAccessKey = process.env.B2_RESTORE_KEY ?? "";
  if (!accessKeyId || !secretAccessKey) {
    console.error(
      "backup:verify: export B2_RESTORE_KEY_ID and B2_RESTORE_KEY in this shell (the read-only restore key; never in .env.local)",
    );
    return 64;
  }
  const inspected = spawnSync(
    "docker",
    ["inspect", "-f", "{{.Config.Image}}", "moz-rewards-postgres-1"],
    { encoding: "utf8" },
  );
  const image = inspected.stdout.trim();
  if (inspected.status !== 0 || !image) {
    console.error(
      "backup:verify: the dev Postgres isn't running (pnpm services:up); its image runs the scratch restore",
    );
    return 1;
  }
  const constants = readBackupConstants(
    readFileSync(path.join(repoRoot, "infra", "host", "moz-backup"), "utf8"),
  );
  const result = await verifyBackup({
    ...args,
    credentials: { accessKeyId, secretAccessKey },
    constants,
    image,
    repoRoot,
    log: (line) => {
      say(`backup:verify: ${line}`);
    },
  });
  for (const line of result.checks) say(`  ${line}`);
  if (result.ok) {
    say(
      `backup:verify: PASS (${args.env}): the newest backup decrypts, restores and passes every check`,
    );
    return 0;
  }
  console.error(`backup:verify: FAIL (${args.env}): ${result.error ?? "unknown"}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().then((code) => process.exit(code));
}
