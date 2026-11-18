import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findBash } from "./lib/find-bash";

/**
 * P0-E close review (H1, M1, M2): the release, rollback, seed-reset and init-env paths of `infra/host/moz-deploy`
 * run for real against stubs. Every host effect (compose, docker, migrations, readiness, firewall, mTLS probe,
 * systemctl, install, openssl) is a shell function that appends one line to a call log and fails when FAIL names
 * it, so the tests assert behaviour (what is started on which release, in which order, and what is recorded)
 * instead of the script's source text (ENGINEERING §15).
 */
const helper = path
  .resolve(import.meta.dirname, "..", "infra", "host", "moz-deploy")
  .replaceAll("\\", "/");
const bash = findBash();

const SHA = "a".repeat(40);
const PREV = "b".repeat(40);
const OLDER = "c".repeat(40);

// FAIL tokens: `up:<sha>:<service>`, `ready:<service>`, `migrate`, `firewall2` (the in-release check, not the
// first one), `mtls`, `signin`, `seed`.
const STUBS = String.raw`
T=$MOZ_T; LOG=$T/calls
has_fail() { [[ " $FAIL " == *" $1 "* ]]; }
data_dir() { echo "$T/data/$1"; }
etc_dir() { echo "$T/etc/$1"; }
write_file() { cat >"$1"; }
compose() {
  local env=$1 sha=$2 last; shift 2
  echo "compose $sha $*" >>"$LOG"
  for last; do :; done
  if [[ $1 == up ]]; then ! has_fail "up:$sha:$last"; return; fi
  if [[ $1 == run ]]; then
    [[ $* == *seed.mjs* ]] && { ! has_fail seed; return; }
    [[ $* == *demo-signin-check* ]] && { ! has_fail signin; return; }
  fi
  return 0
}
wait_ready() { echo "ready $2 $3" >>"$LOG"; ! has_fail "ready:$3"; }
run_migrations() { echo "migrate $2" >>"$LOG"; ! has_fail migrate; }
run_bootstrap() { echo bootstrap >>"$LOG"; }
read_owner_password() { :; }
set_owner_password() { :; }
ensure_pg_image() { :; }
release_infra() { echo "$T/infra"; }
cert_warnings() { :; }
record_origin_cert_expiry() { :; }
FW=0
require_origin_firewall() {
  [[ $1 == staging ]] || return 0
  FW=$((FW + 1)); echo "firewall $FW" >>"$LOG"
  if has_fail firewall2 && ((FW == 2)); then die "the origin firewall is not in place"; fi
}
check_origin_mtls() { [[ $1 == staging ]] || return 0; echo mtls >>"$LOG"; ! has_fail mtls || die "Caddy answered"; }
check_published_ports() { echo "ports $2" >>"$LOG"; }
docker() {
  echo "docker $*" >>"$LOG"
  case "$1 $2" in
    "image inspect") return 0 ;;
    "image ls") if [[ $* == *CreatedAt* ]]; then cat "$T/images-by-date"; else cut -d'|' -f2 "$T/images-by-date"; fi ;;
  esac
}
rm() { echo "rm $*" >>"$LOG"; }
systemctl() { echo "systemctl $*" >>"$LOG"; }
install() { local a; for a; do [[ $a == "$T"/* ]] && mkdir -p "$a"; done; echo "install" >>"$LOG"; }
openssl() { echo "openssl $1" >>"$LOG"; [[ $1 == rand ]] && printf '00'; return 0; }
gen_secret() { echo "gen_secret $(basename "$1")" >>"$LOG"; }
issue_server_cert() { echo "cert $2" >>"$LOG"; }
write_acl() { echo "acl $2" >>"$LOG"; }
pin_backup_key() { echo "pin_backup_key $1" >>"$LOG"; }
chmod() { :; }
SYSTEMD_DIR=$T/systemd
`;

let t = "";
beforeEach(() => {
  t = mkdtempSync(path.join(tmpdir(), "moz-deploy-release-")).replaceAll("\\", "/");
  for (const env of ["staging", "production"]) {
    mkdirSync(path.join(t, "data", env), { recursive: true });
    mkdirSync(path.join(t, "etc", env, "secrets"), { recursive: true });
  }
  mkdirSync(path.join(t, "etc", "staging", "caddy-tls"), { recursive: true });
  for (const f of ["origin.crt", "origin.key"])
    writeFileSync(path.join(t, "etc", "staging", "caddy-tls", f), "stub\n");
  writeFileSync(path.join(t, "images-by-date"), "");
  writeFileSync(path.join(t, "calls"), "");
});
afterEach(() => {
  rmSync(t, { recursive: true, force: true });
});

type Result = { status: number | null; stderr: string; calls: string[] };
function run(command: string, fail = ""): Result {
  const result = spawnSync(bash, ["-c", `source "$1"; ${STUBS}\n${command}`, "_", helper], {
    encoding: "utf8",
    env: { ...process.env, MOZ_T: t, FAIL: fail },
  });
  const calls = readFileSync(path.join(t, "calls"), "utf8").trim().split("\n").filter(Boolean);
  return { status: result.status, stderr: result.stderr, calls };
}
const setRelease = (env: string, current: string, previous?: string): void => {
  writeFileSync(path.join(t, "data", env, "release-current"), `${current}\n`);
  if (previous) writeFileSync(path.join(t, "data", env, "release-previous"), `${previous}\n`);
};
const release = (env: string, name: "current" | "previous"): string => {
  try {
    return readFileSync(path.join(t, "data", env, `release-${name}`), "utf8").trim();
  } catch {
    return "";
  }
};
const ups = (calls: string[], sha: string): string[] =>
  calls.filter((c) => c.startsWith(`compose ${sha} up `)).map((c) => c.split(" ").at(-1) ?? "");
/** Index of the first call matching, or -1. */
const at = (calls: string[], pattern: RegExp): number => calls.findIndex((c) => pattern.test(c));

describe("[P0-15] moz-deploy release: rolling order and failure paths (P0-E review H1, M1)", () => {
  it("[P0-15] a staging release migrates first, then web-1, web-2, worker, firewall, Caddy, mTLS; records it, then the sign-in check and prune", () => {
    setRelease("staging", PREV);
    const r = run(`cmd_release staging ${SHA}`);
    expect(r.stderr).toMatch(/release staging a+: done/);
    expect(r.status).toBe(0);
    expect(ups(r.calls, SHA)).toEqual([
      "redis-cache", // data services: `up ... postgres redis-queue redis-cache`
      "web-1",
      "web-2",
      "worker",
      "caddy",
    ]);
    const migrate = at(r.calls, /^migrate /);
    expect(migrate).toBeGreaterThan(-1);
    expect(migrate).toBeLessThan(at(r.calls, / up .* web-1$/));
    expect(at(r.calls, /^firewall 2$/)).toBeLessThan(at(r.calls, / up .* caddy$/));
    expect(at(r.calls, /^mtls$/)).toBeGreaterThan(at(r.calls, / up .* caddy$/));
    expect(at(r.calls, /demo-signin-check/)).toBeGreaterThan(at(r.calls, /^ports /));
    expect(release("staging", "current")).toBe(SHA);
    expect(release("staging", "previous")).toBe(PREV);
    expect(ups(r.calls, PREV)).toEqual([]);
  });

  it("[P0-15] a failing migration stops before any replica is switched; the previous release stays recorded", () => {
    setRelease("staging", PREV);
    const r = run(`cmd_release staging ${SHA}`, "migrate");
    expect(r.status).not.toBe(0);
    expect(ups(r.calls, SHA).filter((s) => s !== "redis-cache")).toEqual([]);
    expect(release("staging", "current")).toBe(PREV);
  });

  it("[P0-15] web-2 failing its readiness check puts web-1 and web-2 back on the previous release and records nothing", () => {
    setRelease("staging", PREV, OLDER);
    const r = run(`cmd_release staging ${SHA}`, "ready:web-2");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/release a+ aborted; b+ keeps serving/);
    expect(ups(r.calls, SHA)).toEqual(["redis-cache", "web-1", "web-2"]);
    expect(ups(r.calls, PREV)).toEqual(["web-1", "web-2"]);
    expect(release("staging", "current")).toBe(PREV);
    expect(release("staging", "previous")).toBe(OLDER);
  });

  it("[P0-15] a first release whose web fails has nothing to put back and says so", () => {
    const r = run(`cmd_release staging ${SHA}`, "ready:web-1");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/aborted; nothing keeps serving/);
    expect(release("staging", "current")).toBe("");
  });

  it.each([
    ["the worker's up --wait fails", `up:${SHA}:worker`, ["web-1", "web-2", "worker"]],
    ["the in-release firewall check dies", "firewall2", ["web-1", "web-2", "worker"]],
    ["Caddy fails to start", `up:${SHA}:caddy`, ["web-1", "web-2", "worker", "caddy"]],
    ["the mTLS probe dies", "mtls", ["web-1", "web-2", "worker", "caddy"]],
  ])(
    "[P0-15] staging: when %s after web rolled, web and every touched service go back on the previous release",
    (_label, fail, back) => {
      setRelease("staging", PREV, OLDER);
      const r = run(`cmd_release staging ${SHA}`, fail);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/putting web-1 web-2 .* back on b+/);
      expect(ups(r.calls, PREV)).toEqual(back);
      expect(release("staging", "current")).toBe(PREV);
      expect(release("staging", "previous")).toBe(OLDER);
      expect(r.calls.some((c) => c.includes("demo-signin-check"))).toBe(false);
    },
  );

  it("[P0-15] production: Caddy failing after umami puts web, worker, umami and Caddy back; cloudflared never moves", () => {
    setRelease("production", PREV);
    const r = run(`cmd_release production ${SHA}`, `up:${SHA}:caddy`);
    expect(r.status).toBe(1);
    expect(ups(r.calls, SHA)).not.toContain("cloudflared");
    expect(ups(r.calls, PREV)).toEqual(["web-1", "web-2", "worker", "umami", "caddy"]);
    expect(release("production", "current")).toBe(PREV);
    expect(r.calls.some((c) => c.includes("demo-signin-check"))).toBe(false);
  });

  it("[P0-15] production releases run no demo sign-in check", () => {
    setRelease("production", PREV);
    const r = run(`cmd_release production ${SHA}`);
    expect(r.status).toBe(0);
    expect(ups(r.calls, SHA)).toEqual([
      "redis-cache",
      "web-1",
      "web-2",
      "worker",
      "umami",
      "caddy",
      "cloudflared",
    ]);
    expect(r.calls.some((c) => c.includes("demo-signin-check"))).toBe(false);
    expect(r.calls.some((c) => c.includes("seed.mjs"))).toBe(false);
  });

  it("[P0-15] a failed staging sign-in check fails the release", () => {
    setRelease("staging", PREV);
    const r = run(`cmd_release staging ${SHA}`, "signin");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/demo sign-in check failed/);
  });
});

describe("[P0-15] moz-deploy rollback", () => {
  it("[P0-15] rollback moves every service to release-previous and swaps the records", () => {
    setRelease("staging", SHA, PREV);
    const r = run("cmd_rollback staging");
    expect(r.status).toBe(0);
    expect(ups(r.calls, PREV)).toEqual(["web-1", "web-2", "worker", "caddy"]);
    expect(release("staging", "current")).toBe(PREV);
    expect(release("staging", "previous")).toBe(SHA);
  });

  it("[P0-15] a rollback whose worker fails puts web and the worker back on the release that was serving", () => {
    setRelease("staging", SHA, PREV);
    const r = run("cmd_rollback staging", `up:${PREV}:worker`);
    expect(r.status).toBe(1);
    expect(ups(r.calls, SHA)).toEqual(["web-1", "web-2", "worker"]);
    expect(release("staging", "current")).toBe(SHA);
  });

  it("[P0-15] rollback without a recorded previous release refuses before touching anything", () => {
    setRelease("staging", SHA);
    const r = run("cmd_rollback staging");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no previous release recorded for staging/);
    expect(r.calls.filter((c) => c.startsWith("compose"))).toEqual([]);
  });
});

describe("[P0-15] moz-deploy prune", () => {
  it("[P0-15] keeps current, previous and the newest three images; removes the rest with their release dirs", () => {
    const tags = ["1", "2", "3", "4", "5", "6"].map((n) => n.repeat(40));
    const [t1, t2, t3, t4, t5, t6] = tags as [string, string, string, string, string, string];
    // Newest first by date: t6 … t1. Current = t1 (oldest), previous = t2.
    writeFileSync(
      path.join(t, "images-by-date"),
      tags.map((tag, i) => `2026-11-1${i} 10:00:00|${tag}`).join("\n") + "\n",
    );
    setRelease("staging", t1, t2);
    const r = run("prune staging");
    expect(r.status).toBe(0);
    const removed = r.calls
      .filter((c) => c.startsWith("docker image rm "))
      .map((c) => c.split(":").at(-1));
    expect(removed).toEqual([t3]);
    expect(r.calls).toContain(`rm -rf /var/lib/moz/releases/staging/${t3}`);
    for (const kept of [t1, t2, t4, t5, t6]) expect(removed).not.toContain(kept);
  });
});

describe("[P0-15] moz-deploy seed-reset and init-env (P0-E review M2: behaviour, not source text)", () => {
  it("[P0-15] seed-reset re-seeds with --reset on the current release, then runs the sign-in check on it", () => {
    setRelease("staging", SHA);
    const r = run("cmd_seed_reset staging");
    expect(r.status).toBe(0);
    const seed = at(r.calls, new RegExp(`^compose ${SHA} run .*cli/seed\\.mjs --reset$`));
    const check = at(
      r.calls,
      new RegExp(`^compose ${SHA} run .*cli/demo-signin-check\\.mjs --url http://web-1:3000$`),
    );
    expect(seed).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(seed);
  });

  it("[P0-15] seed-reset fails loudly without a release, and when the sign-in check fails", () => {
    expect(run("cmd_seed_reset staging").stderr).toMatch(/no release recorded for staging/);
    setRelease("staging", SHA);
    const failed = run("cmd_seed_reset staging", "signin");
    expect(failed.status).toBe(1);
    expect(failed.stderr).toMatch(/demo sign-in check failed/);
  });

  const units = (names: string[]): void => {
    mkdirSync(path.join(t, "systemd"), { recursive: true });
    for (const n of names) writeFileSync(path.join(t, "systemd", n), "");
  };

  it("[P0-15] init-env pins the backup key, sets the archive-off lever, enables both backup timers and (staging) the demo reset timer", () => {
    units(["moz-backup@.timer", "moz-basebackup@.timer", "moz-seed-reset.timer"]);
    const r = run("cmd_init_env staging");
    expect(r.stderr).toMatch(/init-env staging: done/);
    expect(r.status).toBe(0);
    expect(r.calls).toContain("pin_backup_key staging");
    expect(
      readFileSync(path.join(t, "etc", "staging", "backup-lever", "archive-off"), "utf8"),
    ).toBe("");
    const enabled = r.calls.filter((c) => c.startsWith("systemctl enable"));
    expect(enabled).toEqual([
      "systemctl enable --now --quiet moz-backup@staging.timer",
      "systemctl enable --now --quiet moz-basebackup@staging.timer",
      "systemctl enable --now --quiet moz-seed-reset.timer",
    ]);
  });

  it("[P0-15] init-env leaves the lever alone once wal-g has its keys, and production gets no demo reset timer", () => {
    units(["moz-backup@.timer", "moz-basebackup@.timer"]);
    mkdirSync(path.join(t, "etc", "production", "walg"), { recursive: true });
    writeFileSync(path.join(t, "etc", "production", "walg", "walg.env"), "WALG=1\n");
    const r = run("cmd_init_env production");
    expect(r.status).toBe(0);
    expect(() =>
      readFileSync(path.join(t, "etc", "production", "backup-lever", "archive-off")),
    ).toThrow();
    expect(r.calls.filter((c) => c.startsWith("systemctl enable"))).toEqual([
      "systemctl enable --now --quiet moz-backup@production.timer",
      "systemctl enable --now --quiet moz-basebackup@production.timer",
    ]);
    expect(r.calls).toContain("gen_secret db-umami");
  });

  it("[P0-15] init-env refuses when harden.sh has not installed a timer", () => {
    units(["moz-backup@.timer", "moz-basebackup@.timer"]);
    const r = run("cmd_init_env staging");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/moz-seed-reset\.timer is not installed: run harden\.sh first/);
  });
});
