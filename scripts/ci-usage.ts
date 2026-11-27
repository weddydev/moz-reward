/**
 * `pnpm ci:usage [--enforce]` — GitHub Actions usage this month vs the free allowance (P0-14, ENGINEERING §16,
 * ARCHITECTURE §10). Used by /subphase-complete.
 *   Source 1 (exact): the owner's billing usage report — needs the `user` token scope
 *            (`gh auth refresh -h github.com -s user`, HUMAN_TASKS H-30).
 *   Source 2 (estimate): this repo's jobs this month, each rounded up to a whole minute as GitHub bills them.
 * ≥ 70% → warning (free-tier rule). ≥ 80% → scheduled workflows must pause: `--enforce` disables them
 * (`gh workflow disable`); push CI keeps running. Re-enable next month with `gh workflow enable <file>`.
 * A public repository never pauses: GitHub doesn't bill standard runners there (DECISIONS 14 Nov; the minutes are
 * still printed). Going private before launch (CARRIED C-43) brings the budget back automatically.
 * Env: ACTIONS_MONTHLY_MINUTES (default 2000, GitHub Free).
 */
import { execFile, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { isDirectRun } from "../src/lib/is-direct-run";

export const SCHEDULED_WORKFLOWS = ["scheduled.yml"];
export const WARN_AT = 0.7;
export const PAUSE_AT = 0.8;

export type BillingItem = { product?: string; unitType?: string; quantity?: number };
export type Job = { started_at: string | null; completed_at: string | null };

/** Actions minutes from the billing usage report items. */
export function minutesFromBilling(items: BillingItem[]): number {
  return items
    .filter(
      (i) => i.product?.toLowerCase() === "actions" && i.unitType?.toLowerCase() === "minutes",
    )
    .reduce((sum, i) => sum + (i.quantity ?? 0), 0);
}

/** Billed minutes estimate: each finished job rounded up to a whole minute. */
export function minutesFromJobs(jobs: Job[]): number {
  return jobs.reduce((sum, j) => {
    if (!j.started_at || !j.completed_at) return sum;
    const ms = Date.parse(j.completed_at) - Date.parse(j.started_at);
    return sum + (ms > 0 ? Math.ceil(ms / 60_000) : 0);
  }, 0);
}

export type Visibility = "public" | "private" | "internal";

/** Runs `fn` over `items` with at most `limit` in flight; results keep the input order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

export function level(
  used: number,
  allowance: number,
  visibility: Visibility = "private",
): "ok" | "warn" | "pause" {
  if (visibility === "public") return "ok";
  const share = used / allowance;
  return share >= PAUSE_AT ? "pause" : share >= WARN_AT ? "warn" : "ok";
}

function gh(args: string[]): { ok: boolean; out: string } {
  const r = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.status === 0 ? r.stdout : `${r.stdout}${r.stderr}` };
}

function ghAsync(args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      resolve({ ok: !err, out: stdout });
    });
  });
}

function repo(): { owner: string; name: string; visibility: Visibility } {
  const r = gh([
    "repo",
    "view",
    "--json",
    "owner,name,visibility",
    "--jq",
    '.owner.login + "/" + .name + "/" + (.visibility | ascii_downcase)',
  ]);
  const [owner, name, vis] = r.out.trim().split("/");
  if (!r.ok || !owner || !name || !vis)
    throw new Error(`can't read the GitHub repository: ${r.out.trim()}`);
  // Anything unexpected counts as billed (fail towards pausing, never towards spending).
  const visibility: Visibility = vis === "public" || vis === "internal" ? vis : "private";
  return { owner, name, visibility };
}

function exactMinutes(owner: string, now: Date): number | null {
  const r = gh([
    "api",
    `users/${owner}/settings/billing/usage?year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`,
  ]);
  if (!r.ok) return null;
  const body = JSON.parse(r.out) as { usageItems?: BillingItem[] };
  return minutesFromBilling(body.usageItems ?? []);
}

/** One `gh api` call per run; ~500 runs a month took ~6 min one at a time (KI: ci:usage hang), so 16 at once. */
async function estimatedMinutes(owner: string, name: string, now: Date): Promise<number> {
  const since = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const runs = gh([
    "api",
    "--paginate",
    `repos/${owner}/${name}/actions/runs?created=>=${since}&per_page=100`,
    "--jq",
    ".workflow_runs[].id",
  ]);
  if (!runs.ok) throw new Error(`can't list workflow runs: ${runs.out.trim()}`);
  const ids = runs.out.split("\n").filter(Boolean);
  const perRun = await mapLimit(ids, 16, async (id) => {
    const r = await ghAsync([
      "api",
      "--paginate",
      `repos/${owner}/${name}/actions/runs/${id}/jobs?per_page=100`,
      "--jq",
      ".jobs[]",
    ]);
    if (!r.ok) return [];
    return r.out
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Job);
  });
  return minutesFromJobs(perRun.flat());
}

async function main(): Promise<void> {
  const enforce = process.argv.includes("--enforce");
  const allowance = Number(process.env.ACTIONS_MONTHLY_MINUTES ?? 2000);
  const now = new Date();
  const { owner, name, visibility } = repo();
  const exact = exactMinutes(owner, now);
  const used = exact ?? (await estimatedMinutes(owner, name, now));
  const source =
    exact !== null
      ? "billing report (exact, all of the owner's repos)"
      : "estimate from this repo's job durations (exact needs: gh auth refresh -h github.com -s user)";
  const share = Math.round((used / allowance) * 100);
  const state = level(used, allowance, visibility);
  // In GitHub Actions, scheduled.yml reads `state` to skip its suites at ≥ 80%.
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `state=${state}\n`);
  console.warn(
    `[ci:usage] ${now.toISOString().slice(0, 7)}: ${used} of ${allowance} Actions minutes (${share}%) — ${source}`,
  );
  if (visibility === "public")
    console.warn("[ci:usage] public repository: standard runners are unbilled, so nothing pauses");
  if (state === "warn")
    console.warn(`[ci:usage] WARN: past ${WARN_AT * 100}% of the free allowance`);
  if (state === "pause") {
    console.warn(
      `[ci:usage] ≥ ${PAUSE_AT * 100}%: scheduled workflows must pause (push CI continues)`,
    );
    if (enforce) {
      for (const wf of SCHEDULED_WORKFLOWS) {
        const r = gh(["workflow", "disable", wf]);
        console.warn(`[ci:usage] ${r.ok ? "disabled" : "could not disable"} ${wf}`);
      }
    } else {
      console.warn("[ci:usage] run `pnpm ci:usage --enforce` to disable them, and tell the human");
    }
  }
  process.exit(state === "pause" && !enforce ? 2 : 0);
}

if (isDirectRun(import.meta.url)) void main();
