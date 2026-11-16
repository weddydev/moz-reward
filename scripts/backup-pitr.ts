/**
 * `pnpm backup:verify --wal --target-time <ISO with zone>` (P0-15 D3b, AC4): proves on a developer's laptop that
 * the WAL archive in B2 restores the database to a point in time. The host's keys can't read B2 and the host
 * never holds the private key, so like the dump verify (D3) this runs only here.
 *
 * Steps: list every version under `<env>/wal/` with the read-only restore key; take the newest base backup whose
 * stop sentinel finished (and was uploaded) before the target; select that backup's files and the WAL segments
 * of its timeline from its start segment up to those uploaded within 30 min after the target; download the
 * ciphertext (oldest version of each key) into the run's 0700 directory. Every data object must be an OpenPGP
 * message: a plaintext object in the bucket fails the run. The LAPTOP's gpg decrypts (pinentry through the agent;
 * the private key and its passphrase never enter a container) and the plaintext, still zstd, goes straight into a
 * tmpfs of a scratch container of the staging/production Postgres image: `--network none`, read-only root, no
 * capabilities, noexec tmpfs, no mounts. There wal-g reads it as local file storage (no network, no key):
 * `backup-fetch`, then Postgres replays WAL to the target with the image's own config files, promotes, and
 * infra/backup/checks.sql runs.
 *
 * Everything in the bucket is treated as hostile (design check, 16 Nov): whoever holds the host's list+write key
 * can upload objects validly encrypted to the public key. So object keys are matched against an allowlist and
 * never used as paths (local and container names are built here), sizes are capped, the timeline is pinned to
 * the base backup's, the oldest version of each key is used, and the server log is parsed for two known lines
 * only, never printed (it can quote row values).
 */
import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, readFileSync } from "node:fs";
import path from "node:path";
import { Transform, type Readable, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, ListObjectVersionsCommand, S3Client } from "@aws-sdk/client-s3";
import {
  asResult,
  type BackupConstants,
  type BackupEnv,
  fail,
  failureReason,
  gpgPath,
  importPinnedKey,
  isOpenPgp,
  printable,
  type VerifyResult,
  withRun,
} from "./lib/backup-common";

/** WAL uploaded up to this long after the target is fetched (archive_timeout is 60 s, plus retries). */
export const WAL_SLACK_MS = 30 * 60_000;
/** A week of WAL at one segment a minute is ~10k objects; base backups are weekly. */
export const MAX_OBJECTS = 30_000;
export const MAX_BYTES = 8 * 1024 ** 3;
const MAX_LISTED = 200_000;
const MAX_SENTINELS = 100;
const MAX_JSON_BYTES = 1024 * 1024;
/** A WAL segment is 16 MiB before compression. */
const MAX_WAL_PLAIN = 64 * 1024 * 1024;
const MAX_DATA_PLAIN = 4 * 1024 ** 3;
const MIB = 1024 * 1024;

const DATA_ROOT = "/var/lib/postgresql/data";
const PGDATA = `${DATA_ROOT}/pgdata`;
const RESTORE = "/restore";
// The image keeps the server binaries in /usr/lib/postgresql/17/bin (infra/postgres/Dockerfile: PG 17).
const SAFE_PATH = "PATH=/usr/lib/postgresql/17/bin:/usr/local/bin:/usr/bin:/bin";
const ZSTD_MAGIC = "28b52ffd";
/**
 * Every psql session in the restored (untrusted) cluster: client options beat per-role settings, so a crafted
 * `ALTER ROLE … SET session_preload_libraries` or a PG 17 login event trigger never runs (security review, 16 Nov).
 */
const PSQL_ENV = [
  "-e",
  "PGOPTIONS=-c event_triggers=off -c session_preload_libraries= -c local_preload_libraries=",
];

export interface Version {
  key: string;
  versionId?: string | undefined;
  size: number;
  lastModified?: Date | undefined;
}

/** The oldest version of each key (an overwrite can't replace what was archived), and the keys that have more. */
export function oldestVersions(versions: Version[]): {
  objects: Map<string, Version>;
  overwritten: string[];
} {
  const objects = new Map<string, Version>();
  const counts = new Map<string, number>();
  for (const v of versions) {
    counts.set(v.key, (counts.get(v.key) ?? 0) + 1);
    const seen = objects.get(v.key);
    const older =
      !seen || (v.lastModified?.getTime() ?? Infinity) < (seen.lastModified?.getTime() ?? Infinity);
    if (older) objects.set(v.key, v);
  }
  const overwritten = [...counts].filter(([, n]) => n > 1).map(([key]) => key);
  return { objects, overwritten };
}

const BASE = /^base_([0-9A-F]{8})([0-9A-F]{16})$/;

/** `<env>/wal/basebackups_005/base_<24 hex>_backup_stop_sentinel.json` → the base backup's name. */
export function sentinelBase(key: string, env: BackupEnv): string | null {
  const m = /^(staging|production)\/wal\/basebackups_005\/(base_[0-9A-F]{24})_backup_stop_sentinel\.json$/.exec(key); // prettier-ignore
  return m?.[1] === env ? (m[2] ?? null) : null;
}

export interface Sentinel {
  finish: Date;
  uncompressedBytes: number;
}

/** wal-g's stop sentinel: FinishTime (required) and UncompressedSize (sizes the scratch data directory). */
export function parseSentinel(text: string): Sentinel | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null) return null;
  const { FinishTime, UncompressedSize } = json as Record<string, unknown>;
  if (typeof FinishTime !== "string") return null;
  const finish = new Date(FinishTime);
  if (Number.isNaN(finish.getTime())) return null;
  const size =
    typeof UncompressedSize === "number" &&
    Number.isFinite(UncompressedSize) &&
    UncompressedSize > 0
      ? UncompressedSize
      : 0;
  return { finish, uncompressedBytes: size };
}

export interface BaseCandidate extends Sentinel {
  base: string;
  lastModified?: Date | undefined;
}

/**
 * The newest base backup that finished before the target. FinishTime is written by the host, so the sentinel's
 * upload time (the server's clock) must be before the target too.
 */
export function chooseBase(candidates: BaseCandidate[], target: Date): BaseCandidate | null {
  let best: BaseCandidate | null = null;
  for (const c of candidates) {
    if (!c.lastModified || c.lastModified.getTime() > target.getTime()) continue;
    if (c.finish.getTime() >= target.getTime()) continue;
    if (!best || c.finish > best.finish) best = c;
  }
  return best;
}

export type Kind = "json" | "data" | "wal";

export interface Selected extends Version {
  kind: Kind;
  /** Where it goes under /restore: built from the parsed parts, never copied from the key. */
  name: string;
}

/** A file inside the base backup's directory, from wal-g 3's fixed set; anything else fails the run. */
export function baseFile(rest: string): { kind: Kind; name: string } | null {
  if (rest === "metadata.json" || rest === "files_metadata.json")
    return { kind: "json", name: rest };
  const part = /^tar_partitions\/part_(\d{1,6})\.tar\.zst$/.exec(rest);
  if (part) return { kind: "data", name: `tar_partitions/part_${part[1] ?? ""}.tar.zst` };
  const fixed = /^tar_partitions\/(backup_label|pg_control)\.tar\.zst$/.exec(rest);
  if (fixed) return { kind: "data", name: `tar_partitions/${fixed[1] ?? ""}.tar.zst` };
  return null;
}

/** A WAL segment (or a backup history file) in `wal_005/`: timeline, segment number and our name for it. */
export function walFile(name: string): { tli: string; segno: string; name: string } | null {
  const m = /^([0-9A-F]{8})([0-9A-F]{16})(\.[0-9A-F]{8}\.backup)?\.zst$/.exec(name);
  if (!m) return null;
  const [, tli = "", segno = "", backup = ""] = m;
  return { tli, segno, name: `${tli}${segno}${backup}.zst` };
}

/**
 * What the restore needs: the base backup's files and sentinel, and its timeline's WAL from its start segment
 * up to WAL_SLACK_MS after the target. Throws on an unknown file in the base backup, a missing start segment, or
 * more than MAX_OBJECTS / MAX_BYTES.
 */
export function selectObjects(
  objects: Map<string, Version>,
  env: BackupEnv,
  base: string,
  target: Date,
): Selected[] {
  const m = BASE.exec(base) ?? fail(`not a base backup name: ${printable(base)}`);
  const [, tli = "", startSeg = ""] = m;
  const root = `${env}/wal/`;
  const baseDir = `${root}basebackups_005/${base}/`;
  const walDir = `${root}wal_005/`;
  const sentinel = `${root}basebackups_005/${base}_backup_stop_sentinel.json`;
  const limit = target.getTime() + WAL_SLACK_MS;
  const selected: Selected[] = [];
  for (const [key, v] of objects) {
    if (key === sentinel) {
      selected.push({
        ...v,
        kind: "json",
        name: `${env}/wal/basebackups_005/${base}_backup_stop_sentinel.json`,
      });
    } else if (key.startsWith(baseDir)) {
      const file = baseFile(key.slice(baseDir.length));
      if (!file) fail(`unexpected object in base backup ${base}: ${printable(key)}`);
      else
        selected.push({
          ...v,
          kind: file.kind,
          name: `${env}/wal/basebackups_005/${base}/${file.name}`,
        });
    } else if (key.startsWith(walDir)) {
      const wal = walFile(key.slice(walDir.length));
      // Other timelines, .history and .partial files are never fetched: recovery stays on the base's timeline.
      if (!wal || wal.tli !== tli || wal.segno < startSeg) continue;
      if (!v.lastModified) fail(`${printable(key)} has no upload time in the listing`);
      if ((v.lastModified?.getTime() ?? Infinity) > limit) continue;
      selected.push({ ...v, kind: "wal", name: `${env}/wal/wal_005/${wal.name}` });
    }
  }
  const names = new Set(selected.map((s) => s.name));
  const need = [
    `${env}/wal/basebackups_005/${base}/tar_partitions/pg_control.tar.zst`,
    `${env}/wal/wal_005/${tli}${startSeg}.zst`,
  ];
  for (const n of need) if (!names.has(n)) fail(`${n} is missing from the archive`);
  if (!selected.some((s) => /\/part_\d+\.tar\.zst$/.test(s.name))) {
    fail(`base backup ${base} has no data partition`);
  }
  if (selected.length > MAX_OBJECTS) {
    fail(
      `${String(selected.length)} objects to fetch, more than ${String(MAX_OBJECTS)}: take a newer base backup (moz-backup base)`,
    );
  }
  const bytes = selected.reduce((sum, s) => sum + s.size, 0);
  if (bytes > MAX_BYTES) fail(`${String(bytes)} bytes to fetch, more than ${String(MAX_BYTES)}`);
  return selected.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** recovery_target_time as Postgres reads it, from the parsed instant (never the raw argument). */
export const pgTime = (at: Date): string => at.toISOString().replace("T", " ").replace("Z", "+00");

/** "recovery stopping before commit of transaction 755, time 2026-11-16 08:30:26.37+00" → that time. */
export function stoppedAt(serverLog: string): Date | null {
  const m = /recovery stopping (?:before|after) (?:commit|abort) of transaction \d+, time (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)\+00\b/.exec(serverLog); // prettier-ignore
  if (!m) return null;
  const at = new Date(`${m[1] ?? ""}T${m[2] ?? ""}Z`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** The two failures we name; any other server output stays in the container (it can quote row values). */
export function recoveryFailure(serverLog: string, target: Date): string {
  if (/recovery ended before configured recovery target was reached/.test(serverLog)) {
    return `the archived WAL ends before ${target.toISOString()}: it is not archived yet, or was uploaded more than ${String(WAL_SLACK_MS / 60_000)} min after that time`;
  }
  return "the point-in-time recovery stopped with an error (server log withheld: it can quote data)";
}

/** One ustar header (512 bytes). Names are ours (≤ 100 bytes after a ≤ 155-byte prefix), never from a key. */
export function tarHeader(name: string, size: number, mtime: number): Buffer {
  let prefix = "";
  let base = name;
  if (name.length > 100) {
    const cut = name.lastIndexOf("/", 155);
    prefix = name.slice(0, cut);
    base = name.slice(cut + 1);
  }
  if (
    !/^[A-Za-z0-9_./-]+$/.test(name) ||
    base.length > 100 ||
    prefix.length > 155 ||
    unsafePath(name)
  ) {
    throw new Error(`tar name not allowed: ${printable(name)}`);
  }
  if (size < 0 || size >= 8 ** 11) throw new Error("tar entry too large");
  const h = Buffer.alloc(512);
  const octal = (offset: number, length: number, n: number) =>
    h.write(`${n.toString(8).padStart(length - 1, "0")}\0`, offset, length, "ascii");
  h.write(base, 0, 100, "ascii");
  octal(100, 8, 0o600);
  octal(108, 8, 0);
  octal(116, 8, 0);
  octal(124, 12, size);
  octal(136, 12, Math.floor(mtime / 1000));
  h.write("        ", 148, 8, "ascii");
  h.write("0", 156, 1, "ascii");
  h.write("ustar\0", 257, 6, "ascii");
  h.write("00", 263, 2, "ascii");
  h.write(prefix, 345, 155, "ascii");
  let sum = 0;
  for (const byte of h) sum += byte;
  h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return h;
}
const unsafePath = (name: string) =>
  name.split("/").some((p) => p === "" || p === "." || p === "..");

const tarEntry = (name: string, body: Buffer, mtime: number): Buffer =>
  Buffer.concat([
    tarHeader(name, body.length, mtime),
    body,
    Buffer.alloc((512 - (body.length % 512)) % 512),
  ]);

export interface PitrOptions {
  env: BackupEnv;
  keyFile: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  constants: BackupConstants;
  /** The staging/production Postgres image (infra/postgres: wal-g, the image's pg_hba). */
  image: string;
  repoRoot: string;
  target: Date;
  /** Seconds for WAL replay to reach the target and promote. */
  readySeconds?: number;
  log?: (line: string) => void;
  /** Tests only: a query run in the restored cluster before it is removed. */
  testQuery?: { db: string; sql: string };
}

export interface PitrResult extends VerifyResult {
  stoppedAt?: string;
  testOutput?: string | undefined;
}

async function listVersions(s3: S3Client, bucket: string, prefix: string): Promise<Version[]> {
  const out: Version[] = [];
  let keyMarker: string | undefined;
  let versionMarker: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: prefix,
        KeyMarker: keyMarker,
        VersionIdMarker: versionMarker,
      }),
    );
    for (const v of page.Versions ?? []) {
      if (v.Key && typeof v.Size === "number") {
        out.push({
          key: v.Key,
          versionId: v.VersionId,
          size: v.Size,
          lastModified: v.LastModified,
        });
      }
    }
    if (out.length > MAX_LISTED) fail(`more than ${String(MAX_LISTED)} objects under ${prefix}`);
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    versionMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
  } while (keyMarker);
  return out;
}

const versionArg = (v: Version) =>
  v.versionId && v.versionId !== "null" ? { VersionId: v.versionId } : {};

async function getText(s3: S3Client, bucket: string, v: Version, max: number): Promise<string> {
  if (v.size > max)
    fail(`${printable(v.key)} is ${String(v.size)} bytes, more than ${String(max)}`);
  const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: v.key, ...versionArg(v) }));
  const text = (await got.Body?.transformToString()) ?? "";
  if (Buffer.byteLength(text) > max) fail(`${printable(v.key)} is larger than listed`);
  return text;
}

/** Downloads one version to `file`, refusing more bytes than the listing said; returns the first byte. */
async function fetchTo(
  s3: S3Client,
  bucket: string,
  v: Version,
  file: string,
): Promise<number | undefined> {
  const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: v.key, ...versionArg(v) }));
  if (!got.Body) fail(`${printable(v.key)} has no body`);
  let size = 0;
  let first: number | undefined;
  const tap = new Transform({
    transform(chunk: Buffer, _enc, done) {
      if (size === 0) first = chunk[0];
      size += chunk.length;
      if (size > v.size) {
        done(new Error(`${printable(v.key)} is larger than listed`));
        return;
      }
      done(null, chunk);
    },
  });
  await pipeline(got.Body as Readable, tap, createWriteStream(file, { mode: 0o600 }));
  if (size !== v.size)
    fail(`${printable(v.key)}: downloaded ${String(size)} bytes, listed ${String(v.size)}`);
  return first;
}

async function pool<T>(items: T[], width: number, each: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await each(items[i] as T, i);
      }
    }),
  );
}

/** The controlling terminal for a curses pinentry (stdin may be the piped key). */
function gpgEnv(): NodeJS.ProcessEnv {
  if (process.env.GPG_TTY || process.platform === "win32") return process.env;
  const t = spawnSync("tty", { stdio: ["inherit", "pipe", "ignore"], encoding: "utf8" });
  const tty = t.status === 0 ? t.stdout.trim() : "/dev/tty";
  return { ...process.env, GPG_TTY: tty };
}

/**
 * The bytes of the one OpenPGP literal data packet that `gpg --unwrap` leaves after removing the encryption layer
 * (RFC 4880 §4.2, §5.9). Why not `gpg --decrypt`: wal-g's Go OpenPGP library writes the literal packet in text
 * mode ("u"), and gpg then rewrites line endings on output, which corrupts the binary zstd stream (found on the
 * first end-to-end run, 16 Nov). wal-g's own reader ignores the mode; so does this. New-format headers with
 * one-, two-, five-octet and partial body lengths, and old-format headers with fixed or indeterminate length.
 * Anything else (a compressed packet, a second packet, a truncated one) is an error.
 */
export class LiteralBody extends Transform {
  private buf: Buffer = Buffer.alloc(0);
  private stage: "ctb" | "len" | "body" | "end" = "ctb";
  private newFormat = true;
  private oldLenOctets = 0;
  private indeterminate = false;
  private left = 0;
  private last = false;
  /** The literal packet's own header (format, name, date) until it is complete; null after. */
  private header: Buffer | null = Buffer.alloc(0);

  override _transform(chunk: Buffer, _enc: BufferEncoding, done: TransformCallback): void {
    this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
    try {
      this.drain();
      done();
    } catch (e) {
      done(e as Error);
    }
  }

  override _flush(done: TransformCallback): void {
    const complete =
      (this.stage === "end" || (this.indeterminate && this.stage === "body")) &&
      this.buf.length === 0 &&
      this.header === null;
    done(complete ? null : new Error("truncated OpenPGP literal packet"));
  }

  private drain(): void {
    for (;;) {
      if (this.stage === "ctb") {
        if (this.buf.length === 0) return;
        const c = this.buf[0] ?? 0;
        this.buf = this.buf.subarray(1);
        if ((c & 0xc0) === 0xc0) {
          if ((c & 0x3f) !== 11)
            throw new Error(`OpenPGP packet ${String(c & 0x3f)} is not literal data`);
          this.newFormat = true;
          this.stage = "len";
        } else if ((c & 0xc0) === 0x80) {
          if (((c >> 2) & 0x0f) !== 11)
            throw new Error(`OpenPGP packet ${String((c >> 2) & 0x0f)} is not literal data`);
          this.newFormat = false;
          const type = c & 3;
          if (type === 3) {
            this.indeterminate = true;
            this.stage = "body";
          } else {
            this.oldLenOctets = [1, 2, 4][type] ?? 1;
            this.stage = "len";
          }
        } else throw new Error("not an OpenPGP packet");
      } else if (this.stage === "len") {
        const b = this.buf;
        if (this.newFormat) {
          const a = b[0];
          if (a === undefined) return;
          if (a < 192) [this.left, this.last, this.buf] = [a, true, b.subarray(1)];
          else if (a < 224) {
            if (b.length < 2) return;
            [this.left, this.last, this.buf] = [
              ((a - 192) << 8) + (b[1] ?? 0) + 192,
              true,
              b.subarray(2),
            ];
          } else if (a === 255) {
            if (b.length < 5) return;
            [this.left, this.last, this.buf] = [b.readUInt32BE(1), true, b.subarray(5)];
          } else [this.left, this.last, this.buf] = [1 << (a & 0x1f), false, b.subarray(1)];
        } else {
          if (b.length < this.oldLenOctets) return;
          const n = this.oldLenOctets;
          this.left = n === 1 ? (b[0] ?? 0) : n === 2 ? b.readUInt16BE(0) : b.readUInt32BE(0);
          this.last = true;
          this.buf = b.subarray(n);
        }
        this.stage = "body";
      } else if (this.stage === "body") {
        const take = this.indeterminate ? this.buf.length : Math.min(this.left, this.buf.length);
        if (take > 0) {
          this.body(this.buf.subarray(0, take));
          this.buf = this.buf.subarray(take);
          if (!this.indeterminate) this.left -= take;
        }
        if (this.indeterminate || this.left > 0) return;
        this.stage = this.last ? "end" : "len";
      } else {
        if (this.buf.length > 0) throw new Error("data after the OpenPGP literal packet");
        return;
      }
    }
  }

  private body(data: Buffer): void {
    let rest = data;
    if (this.header !== null) {
      const h = Buffer.concat([this.header, rest]);
      const need = h.length >= 2 ? 2 + (h[1] ?? 0) + 4 : Infinity;
      if (h.length < need) {
        this.header = h;
        return;
      }
      if (![0x62, 0x74, 0x75].includes(h[0] ?? 0)) throw new Error("unknown literal data format");
      this.header = null;
      rest = h.subarray(need);
    }
    if (rest.length > 0) this.push(rest);
  }
}

/**
 * gpg removing the encryption layer only; LiteralBody takes the bytes out. The integrity check (MDC/AEAD) still
 * runs, but only at the end: the plaintext is already out when gpg exits 2 on a manipulated message, so every
 * caller checks the exit status before anything is used. gpg ignores --max-output with --unwrap: callers count.
 */
function gpgDecrypt(home: string, file: string) {
  return spawn(
    "gpg",
    ["--homedir", gpgPath(home), "--batch", "--no-auto-key-retrieve", "--quiet", "--output", "-", "--unwrap", gpgPath(file)], // prettier-ignore
    { stdio: ["ignore", "pipe", "pipe"], env: gpgEnv() },
  );
}

const exited = (child: ReturnType<typeof spawn>): Promise<number | null> =>
  child.exitCode !== null
    ? Promise.resolve(child.exitCode)
    : once(child, "close").then(([c]) => c as number | null);

/** Decrypts one object into memory (WAL segments and JSON-sized things only). */
async function decryptToBuffer(
  home: string,
  file: string,
  max: number,
  label: string,
): Promise<Buffer> {
  const child = gpgDecrypt(home, file);
  const chunks: Buffer[] = [];
  let size = 0;
  const literal = new LiteralBody();
  literal.on("data", (b: Buffer) => {
    size += b.length;
    if (size <= max) chunks.push(b);
  });
  child.stderr.resume();
  const parsed = pipeline(child.stdout, literal).then(
    () => true,
    () => false,
  );
  const [code, ok] = await Promise.all([exited(child), parsed]);
  if (code !== 0) fail(`gpg could not decrypt ${label}`);
  if (size > max) fail(`${label} decrypts to more than ${String(max)} bytes`);
  if (!ok) fail(`${label} is not a single OpenPGP literal data packet`);
  const body = Buffer.concat(chunks);
  if (body.subarray(0, 4).toString("hex") !== ZSTD_MAGIC) fail(`${label} did not decrypt to zstd`);
  return body;
}

/** Decrypts one base backup partition straight into the container's tmpfs (no copy in memory or on disk). */
async function decryptInto(
  container: string,
  home: string,
  file: string,
  name: string,
  label: string,
) {
  const gpgChild = gpgDecrypt(home, file);
  const sink = spawn(
    "docker",
    [
      "exec",
      "-i",
      container,
      "sh",
      "-c",
      'umask 077; mkdir -p "${1%/*}" && cat > "$1"',
      "sh",
      `${RESTORE}/${name}`,
    ],
    { stdio: ["pipe", "ignore", "ignore"] },
  );
  let head = Buffer.alloc(0);
  let size = 0;
  const tap = new Transform({
    transform(chunk: Buffer, _enc, done) {
      if (head.length < 4) head = Buffer.concat([head, chunk.subarray(0, 4 - head.length)]);
      size += chunk.length;
      done(size > MAX_DATA_PLAIN ? new Error("too large") : null, chunk);
    },
  });
  gpgChild.stderr.resume();
  const piped = pipeline(gpgChild.stdout, new LiteralBody(), tap, sink.stdin).then(
    () => true,
    () => false,
  );
  const [g, d, ok] = await Promise.all([exited(gpgChild), exited(sink), piped]);
  if (g !== 0) fail(`gpg could not decrypt ${label}`);
  if (size > MAX_DATA_PLAIN) fail(`${label} decrypts to more than ${String(MAX_DATA_PLAIN)} bytes`);
  if (!ok) fail(`${label} is not a single OpenPGP literal data packet`);
  if (head.toString("hex") !== ZSTD_MAGIC) fail(`${label} did not decrypt to zstd`);
  if (d !== 0) fail(`${label} could not be copied into the scratch container (tmpfs full?)`);
}

function dx(args: string[], timeoutMs: number, input?: string): SpawnSyncReturns<string> {
  return spawnSync("docker", ["exec", ...args], {
    input,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 4 * MIB,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function verifyPitr(o: PitrOptions): Promise<PitrResult> {
  const log = o.log ?? (() => {});
  const container = `moz-verify-${o.env}-pitr`;
  return withRun("moz-backup-pitr-", [container], async (work, home) => {
    try {
      const { bucket } = o.constants;
      const s3 = new S3Client({
        endpoint: o.constants.endpoint,
        region: o.constants.region,
        forcePathStyle: true,
        credentials: o.credentials,
      });
      const { objects, overwritten } = oldestVersions(
        await listVersions(s3, bucket, `${o.env}/wal/`),
      );

      const sentinels = [...objects.values()]
        .filter((v) => sentinelBase(v.key, o.env))
        .sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0))
        .slice(0, MAX_SENTINELS);
      const candidates: BaseCandidate[] = [];
      for (const v of sentinels) {
        const parsed = parseSentinel(await getText(s3, bucket, v, 64 * 1024));
        if (parsed)
          candidates.push({
            ...parsed,
            base: sentinelBase(v.key, o.env) ?? "",
            lastModified: v.lastModified,
          });
      }
      const chosen =
        chooseBase(candidates, o.target) ??
        fail(`no base backup under ${o.env}/wal/ finished before ${o.target.toISOString()}`);
      const selected = selectObjects(objects, o.env, chosen.base, o.target);
      const bytes = selected.reduce((sum, s) => sum + s.size, 0);
      const walCount = selected.filter((s) => s.kind === "wal").length;
      log(`base backup ${chosen.base} (finished ${chosen.finish.toISOString()}), ${String(walCount)} WAL files, ${String(bytes)} bytes to fetch`); // prettier-ignore
      const touched = overwritten.filter((k) => selected.some((s) => s.key === k));
      if (touched.length > 0) {
        log(
          `${String(touched.length)} of them have more than one version in B2: the oldest of each is used`,
        );
      }

      const files = selected.map((_, i) => path.join(work, `obj-${String(i)}`));
      await pool(selected, 8, async (s, i) => {
        const first = await fetchTo(s3, bucket, s, files[i] ?? "");
        if (s.kind === "json") {
          if (s.size > MAX_JSON_BYTES)
            fail(`${printable(s.key)} is larger than ${String(MAX_JSON_BYTES)} bytes`);
          try {
            JSON.parse(readFileSync(files[i] ?? "", "utf8"));
          } catch {
            fail(`${printable(s.key)} is not JSON`);
          }
        } else if (!isOpenPgp(first)) {
          // wal-g encrypts every data object: a plaintext one means encryption at rest is broken.
          fail(`${printable(s.key)} is not an OpenPGP message`);
        }
      });
      log(`downloaded ${String(selected.length)} objects; every data object is OpenPGP ciphertext`);

      importPinnedKey(home, o.keyFile, o.constants.fingerprint);
      log(`private key ${o.constants.fingerprint} imported into a throwaway GNUPGHOME`);

      // tmpfs sizes: the plaintext is about the size of the ciphertext; the data directory needs the cluster plus
      // room for replayed WAL. Charged to the container's memory only as it fills.
      const restoreBytes = Math.ceil(bytes * 1.1) + 64 * MIB;
      const dataBytes =
        Math.ceil(Math.min(chosen.uncompressedBytes, MAX_BYTES * 4) * 1.2) + 1024 * MIB;
      const memory = restoreBytes + dataBytes + 512 * MIB;
      const tmpfs = (dir: string, opts: string) => [
        "--tmpfs",
        `${dir}:rw,noexec,nosuid,nodev,${opts}`,
      ];
      const run = spawnSync(
        "docker",
        [
          "run", "-d", "--name", container, "--network", "none", "--read-only", "--cap-drop", "ALL",
          "--security-opt", "no-new-privileges:true", "--user", "999:999",
          "--memory", String(memory), "--memory-swap", String(memory), "--cpus", "1", "--pids-limit", "256",
          ...tmpfs(DATA_ROOT, `uid=999,gid=999,mode=0700,size=${String(dataBytes)}`),
          ...tmpfs(RESTORE, `uid=999,gid=999,mode=0700,size=${String(restoreBytes)}`),
          ...tmpfs("/var/run/postgresql", "uid=999,gid=999,mode=0775,size=8m"),
          ...tmpfs("/tmp", "mode=1777,size=64m"),
          "--entrypoint", "sleep", o.image, "infinity",
        ], // prettier-ignore
        { encoding: "utf8", timeout: 120_000 },
      );
      if (run.status !== 0)
        fail(
          `the scratch container did not start: ${printable(run.stderr.trim().split("\n").at(-1) ?? "")}`,
        );

      // Base partitions first and one at a time: the first decryption is where pinentry asks for the passphrase.
      const order = selected.map((s, i) => ({ s, file: files[i] ?? "" }));
      for (const { s, file } of order.filter((x) => x.s.kind === "data")) {
        await decryptInto(container, home, file, s.name, printable(s.key));
      }
      // JSON and WAL as one tar stream into the tmpfs (thousands of small objects).
      const tar = spawn(
        "docker",
        ["exec", "-i", container, "tar", "-x", "-C", RESTORE, "-f", "-"],
        {
          stdio: ["pipe", "ignore", "ignore"],
        },
      );
      const tarState = { broken: false };
      tar.stdin.on("error", () => (tarState.broken = true));
      const put = async (entry: Buffer) => {
        if (tarState.broken) fail("the scratch container stopped taking files (tmpfs full?)");
        if (!tar.stdin.write(entry)) await once(tar.stdin, "drain");
      };
      const now = Date.now();
      await pool(
        order.filter((x) => x.s.kind !== "data"),
        4,
        async ({ s, file }) => {
          const body =
            s.kind === "json"
              ? readFileSync(file)
              : await decryptToBuffer(home, file, MAX_WAL_PLAIN, printable(s.key));
          await put(tarEntry(s.name, body, now));
        },
      );
      tar.stdin.end(Buffer.alloc(1024));
      if ((await exited(tar)) !== 0 || tarState.broken)
        fail("the WAL could not be copied into the scratch container");
      log("decrypted into the scratch container's tmpfs (no network, no key inside)");

      const walEnv = [
        "env",
        "-i",
        SAFE_PATH,
        "HOME=/tmp",
        `WALG_FILE_PREFIX=${RESTORE}/${o.env}/wal`,
      ];
      const fetched = dx(
        [container, ...walEnv, "wal-g", "backup-fetch", PGDATA, chosen.base],
        30 * 60_000,
      );
      if (fetched.status !== 0) fail(`wal-g could not unpack base backup ${chosen.base}`);
      // Settings come from the image and the command line only: the restored auto.conf is emptied.
      const prep = dx([container, "sh", "-c", ': > "$1/postgresql.auto.conf" && rm -f "$1/standby.signal" && touch "$1/recovery.signal"', "sh", PGDATA], 30_000); // prettier-ignore
      if (prep.status !== 0) fail("could not prepare the restored data directory");

      const tli = Number.parseInt(BASE.exec(chosen.base)?.[1] ?? "1", 16);
      const settings = [
        // PG 17 image (infra/postgres/Dockerfile): its sample config, ident file and our pg_hba (peer only).
        "config_file=/usr/share/postgresql/postgresql.conf.sample",
        "hba_file=/etc/postgresql/pg_hba.conf",
        "ident_file=/usr/share/postgresql/17/pg_ident.conf.sample",
        "listen_addresses=",
        "unix_socket_directories=/var/run/postgresql",
        "shared_preload_libraries=",
        "session_preload_libraries=",
        "local_preload_libraries=",
        "archive_mode=off",
        "hot_standby=off",
        "logging_collector=off",
        "log_statement=none",
        "timezone=UTC",
        "log_timezone=UTC",
        'restore_command=wal-g wal-fetch "%f" "%p"',
        `recovery_target_time=${pgTime(o.target)}`,
        "recovery_target_inclusive=on",
        `recovery_target_timeline=${String(tli)}`,
        "recovery_target_action=promote",
      ];
      const start = dx(
        ["-d", container, ...walEnv, "sh", "-c", 'exec postgres "$@" >/tmp/pitr.log 2>&1', "sh", "-D", PGDATA, ...settings.flatMap((s) => ["-c", s])],
        30_000,
      ); // prettier-ignore
      if (start.status !== 0) fail("Postgres did not start in the scratch container");

      const serverLog = () =>
        dx([container, "tail", "-c", "1048576", "/tmp/pitr.log"], 15_000).stdout || "";
      const ready = o.readySeconds ?? 900;
      const deadline = Date.now() + ready * 1000;
      let seenUp = false;
      const begun = Date.now();
      for (;;) {
        const q = dx([...PSQL_ENV, container, "psql", "-X", "-A", "-t", "-d", "postgres", "-c", "SELECT pg_is_in_recovery()"], 15_000); // prettier-ignore
        if (q.status === 0 && q.stdout.trim() === "f") break;
        const up = dx([container, "test", "-e", `${PGDATA}/postmaster.pid`], 15_000).status === 0;
        seenUp ||= up;
        if (!up) {
          // A failed recovery can exit before the first look sees postmaster.pid: the log decides.
          const text = serverLog();
          if (seenUp || /(?:FATAL|PANIC):|database system is shut down/.test(text)) {
            fail(recoveryFailure(text, o.target));
          }
          if (Date.now() - begun > 60_000) {
            fail(
              "Postgres did not start in the scratch container (server log withheld: it can quote data)",
            );
          }
        }
        if (Date.now() > deadline)
          fail(`recovery did not reach the target within ${String(ready)} s`);
        await sleep(1000);
      }
      const stop =
        stoppedAt(serverLog()) ?? fail("recovery promoted without reporting where it stopped");
      const checks = [
        `pitr|pass|base ${chosen.base} + ${String(walCount)} WAL files replayed to ${o.target.toISOString()}; stopped at a commit at ${stop.toISOString()}`,
      ];
      log(checks[0] ?? "");

      const sql = readFileSync(path.join(o.repoRoot, "infra", "backup", "checks.sql"), "utf8");
      const r = dx(
        ["-i", ...PSQL_ENV, container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", "moz"],
        10 * 60_000,
        sql,
      );
      checks.push(
        ...r.stdout
          .split("\n")
          .map(printable)
          .filter((l) => /^[a-z_]+\|pass\|/.test(l)),
      );
      let testOutput: string | undefined;
      if (o.testQuery) {
        testOutput = dx([...PSQL_ENV, container, "psql", "-X", "-A", "-t", "-d", o.testQuery.db, "-c", o.testQuery.sql], 60_000).stdout.trim(); // prettier-ignore
      }
      if (r.status !== 0) {
        return { ok: false, checks, error: printable(failureReason(r.stderr || "", r.status)), stoppedAt: stop.toISOString(), testOutput }; // prettier-ignore
      }
      if (!checks.at(-1)?.startsWith("all|pass|")) {
        return { ok: false, checks, error: "checks.sql did not report a pass", stoppedAt: stop.toISOString(), testOutput }; // prettier-ignore
      }
      return { ok: true, checks, stoppedAt: stop.toISOString(), testOutput };
    } catch (e) {
      return asResult(e);
    }
  });
}
