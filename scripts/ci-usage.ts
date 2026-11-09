/**
 * `pnpm ci:usage [--enforce]` — GitHub Actions usage this month vs the free allowance (P0-14, ENGINEERING §16,
 * ARCHITECTURE §10). Used by /subphase-complete.
 *   Source 1 (exact): the owner's billing usage report — needs the `user` token scope
 *            (`gh auth refresh -h github.com -s user`, HUMAN_TASKS H-30).
 *   Source 2 (estimate): this repo's jobs this month, each rounded up to a whole minute as GitHub bills them.
 * ≥ 70% → warning (free-tier rule). ≥ 80% → scheduled workflows must pause: `--enforce` disables them
 * (`gh workflow disable`); push CI keeps running. Re-enable next month with `gh workflow enable <file>`.
 * Env: ACTIONS_MONTHLY_MINUTES (default 2000, GitHub Free).
 */
import { spawnSync } from "node:child_process";
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

export function level(used: number, allowance: number): "ok" | "warn" | "pause" {
  const share = used / allowance;
  return share >= PAUSE_AT ? "pause" : share >= WARN_AT ? "warn" : "ok";
}

function gh(args: string[]): { ok: boolean; out: string } {
  const r = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.status === 0 ? r.stdout : `${r.stdout}${r.stderr}` };
}

function repo(): { owner: string; name: string } {
  const r = gh(["repo", "view", "--json", "owner,name", "--jq", '.owner.login + "/" + .name']);
  const [owner, name] = r.out.trim().split("/");
  if (!r.ok || !owner || !name)
    throw new Error(`can't read the GitHub repository: ${r.out.trim()}`);
  return { owner, name };
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

function estimatedMinutes(owner: string, name: string, now: Date): number {
  const since = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const runs = gh([
    "api",
    "--paginate",
    `repos/${owner}/${name}/actions/runs?created=>=${since}&per_page=100`,
    "--jq",
    ".workflow_runs[].id",
  ]);
  if (!runs.ok) throw new Error(`can't list workflow runs: ${runs.out.trim()}`);
  const jobs: Job[] = [];
  for (const id of runs.out.split("\n").filter(Boolean)) {
    const r = gh([
      "api",
      "--paginate",
      `repos/${owner}/${name}/actions/runs/${id}/jobs?per_page=100`,
      "--jq",
      ".jobs[]",
    ]);
    if (!r.ok) continue;
    for (const line of r.out.split("\n").filter(Boolean)) jobs.push(JSON.parse(line) as Job);
  }
  return minutesFromJobs(jobs);
}

function main(): void {
  const enforce = process.argv.includes("--enforce");
  const allowance = Number(process.env.ACTIONS_MONTHLY_MINUTES ?? 2000);
  const now = new Date();
  const { owner, name } = repo();
  const exact = exactMinutes(owner, now);
  const used = exact ?? estimatedMinutes(owner, name, now);
  const source =
    exact !== null
      ? "billing report (exact, all of the owner's repos)"
      : "estimate from this repo's job durations (exact needs: gh auth refresh -h github.com -s user)";
  const share = Math.round((used / allowance) * 100);
  const state = level(used, allowance);
  // In GitHub Actions, scheduled.yml reads `state` to skip its suites at ≥ 80%.
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `state=${state}\n`);
  console.warn(
    `[ci:usage] ${now.toISOString().slice(0, 7)}: ${used} of ${allowance} Actions minutes (${share}%) — ${source}`,
  );
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

if (isDirectRun(import.meta.url)) main();
