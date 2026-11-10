/**
 * Gate pass stamps (token/speed rule, human 10 Nov 2026): when `pnpm gate:task` passes, it records the git tree
 * hash of the exact content it tested (working tree incl. untracked, minus ignored files) and the task IDs whose
 * E2E specs ran. The pre-push hook skips re-running the gate only when every pushed commit's tree has a stamp
 * covering the same IDs, i.e. byte-identical code already passed the full gate. Any change re-runs it; CI
 * still runs on every push.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const STAMP_DIR = path.join(".artifacts", "gate", "pass");
/** A stamp older than this is ignored (dependencies, services or env may have moved on). */
export const STAMP_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type Stamp = { ids: string[]; at: number };

const git = (args: string[], env?: Record<string, string>): string | null => {
  const r = spawnSync("git", args, {
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
  });
  return r.status === 0 ? r.stdout.trim() : null;
};

/** Tree hash of the working tree as it is now (what a `git add -A && git commit` would record). */
export function workingTreeHash(): string | null {
  const indexPath = git(["rev-parse", "--git-path", "moz-gate-index"]);
  if (!indexPath) return null;
  const env = { GIT_INDEX_FILE: path.resolve(indexPath) };
  try {
    if (git(["read-tree", "HEAD"], env) === null) return null;
    if (git(["add", "-A"], env) === null) return null;
    return git(["write-tree"], env);
  } finally {
    rmSync(path.resolve(indexPath), { force: true });
  }
}

export const commitTreeHash = (sha: string): string | null => git(["rev-parse", `${sha}^{tree}`]);

/** Pure: does this stamp vouch for `ids` at time `now`? */
export function covers(stamp: Stamp | null, ids: readonly string[], now: number): boolean {
  if (!stamp || ids.length === 0) return false;
  if (now - stamp.at > STAMP_MAX_AGE_MS || stamp.at > now) return false;
  return ids.every((id) => stamp.ids.includes(id));
}

export function readStamp(tree: string): Stamp | null {
  const file = path.join(STAMP_DIR, `${tree}.json`);
  if (!/^[0-9a-f]{40,64}$/.test(tree) || !existsSync(file)) return null;
  try {
    const s = JSON.parse(readFileSync(file, "utf8")) as Stamp;
    return Array.isArray(s.ids) && typeof s.at === "number" ? s : null;
  } catch {
    return null;
  }
}

export function writeStamp(tree: string, ids: readonly string[], now = Date.now()): void {
  mkdirSync(STAMP_DIR, { recursive: true });
  writeFileSync(
    path.join(STAMP_DIR, `${tree}.json`),
    JSON.stringify({ ids: [...ids].sort(), at: now }),
  );
}
