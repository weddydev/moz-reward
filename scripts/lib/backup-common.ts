/**
 * What `pnpm backup:verify` (dump restore, P0-15 D3) and `pnpm backup:verify --wal` (point-in-time restore, D3b)
 * share: the fixed constants from infra/host/moz-backup, the throwaway GNUPGHOME and its pinned key, and one
 * run's temporary directory and container, removed on every exit (Ctrl-C included) and before the next run.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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

/** OpenPGP message, first packet a PKESK (old format 0x84–0x87 or new 0xC1), as moz-backup's is_openpgp. */
export const isOpenPgp = (first: number | undefined): boolean =>
  first !== undefined && ((first >= 0x84 && first <= 0x87) || first === 0xc1);

export class VerifyError extends Error {}
export const fail = (message: string): never => {
  throw new VerifyError(message);
};

/** Object keys are written by whoever holds a write key: never print their control characters. */
export const printable = (text: string): string => text.replace(/[^\x20-\x7e]/g, "?");

let posixGpg: boolean | undefined;
/**
 * A path as this machine's gpg reads it. Git for Windows' gpg (an MSYS program) reads `C:\…` as a relative path;
 * it wants `/c/…`. Gpg4win and every other platform take the path as it is.
 */
export function gpgPath(file: string): string {
  if (process.platform !== "win32") return file;
  posixGpg ??= /^Home: \//m.test(
    spawnSync("gpg", ["--version"], { encoding: "utf8" }).stdout || "",
  );
  if (!posixGpg) return file;
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(file);
  return m ? `/${(m[1] ?? "").toLowerCase()}/${(m[2] ?? "").replaceAll("\\", "/")}` : file;
}

/** gpg against the throwaway home: batch, never fetching keys from the network. */
export function gpg(home: string, args: string[], input?: Buffer): SpawnSyncReturns<string> {
  return spawnSync(
    "gpg",
    ["--homedir", gpgPath(home), "--batch", "--no-auto-key-retrieve", ...args],
    { input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}

/**
 * A new GNUPGHOME (0700). The agent's passphrase cache is set here rather than left to the defaults: 15 min after
 * the last use, 1 h at most, so a long WAL restore needs the passphrase once and the unlocked key never outlives
 * the run by much (the agent is killed on exit anyway). Pinentry stays the agent's own (no loopback).
 */
export function makeHome(home: string): void {
  mkdirSync(home, { mode: 0o700 });
  writeFileSync(path.join(home, "gpg-agent.conf"), "default-cache-ttl 900\nmax-cache-ttl 3600\n", {
    mode: 0o600,
  });
}

/** Imports the key and returns the fingerprints that have a secret part. */
export function importKey(home: string, keyFile: string): string[] {
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

/** Imports the key and fails unless it is the pinned backup key. */
export function importPinnedKey(home: string, keyFile: string, fingerprint: string): void {
  if (!importKey(home, keyFile).includes(fingerprint)) {
    fail(`the private key is not the backup key ${fingerprint}`);
  }
}

export function pick(env: NodeJS.ProcessEnv, names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = env[name];
    if (value !== undefined) out[name] = value;
  }
  return out;
}

function removeRun(work: string, containers: string[]): void {
  for (const container of containers)
    spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  // gpg ≥ 2.4 may start keyboxd as well as gpg-agent in a new homedir.
  spawnSync("gpgconf", ["--homedir", gpgPath(path.join(work, "gnupg")), "--kill", "all"], {
    stdio: "ignore",
  });
  rmSync(work, { recursive: true, force: true });
}

/** What a run killed hard (SIGKILL, power loss) left: its key, agent, downloads and containers. */
export function removeLeftovers(prefix: string, containers: string[]): void {
  for (const name of readdirSync(tmpdir())) {
    if (name.startsWith(prefix)) removeRun(path.join(tmpdir(), name), containers);
  }
  for (const container of containers)
    spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}

/**
 * Runs `body` with a fresh 0700 work directory (`<work>/gnupg` is the key's home) and removes it, the gpg agent
 * and the containers on every exit: return, throw, Ctrl-C, SIGTERM or SIGHUP. Leftovers of a killed run go first.
 */
export async function withRun<T>(
  /** Per command (`moz-backup-verify-`, `moz-backup-pitr-`): one never removes the other's run. */
  prefix: string,
  containers: string[],
  body: (work: string, home: string) => Promise<T>,
): Promise<T> {
  removeLeftovers(prefix, containers);
  const work = mkdtempSync(path.join(tmpdir(), prefix));
  const home = path.join(work, "gnupg");
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    removeRun(work, containers);
  };
  const onSignal = (signal: NodeJS.Signals) => {
    cleanup();
    process.exit(signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143);
  };
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  // on, not once: a second Ctrl-C during cleanup must not kill the process half-way.
  for (const signal of signals) process.on(signal, onSignal);
  try {
    makeHome(home);
    return await body(work, home);
  } finally {
    for (const signal of signals) process.removeListener(signal, onSignal);
    cleanup();
  }
}

export interface VerifyResult {
  ok: boolean;
  checks: string[];
  error?: string;
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

/** A VerifyError is the run's own message; anything else came from the S3 client. */
export function asResult(e: unknown): VerifyResult {
  if (e instanceof VerifyError) return { ok: false, checks: [], error: e.message };
  const message = e instanceof Error ? e.message : String(e);
  return { ok: false, checks: [], error: `B2/S3: ${printable(message)}` };
}
