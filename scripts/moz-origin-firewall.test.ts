import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findBash } from "./lib/find-bash";

/**
 * P0-15 C1b: `infra/host/moz-origin-firewall` keeps everyone but Cloudflare away from the staging origin
 * (DOCKER-USER → MOZ-ORIGIN). These tests source it in bash with `scripts/lib/fake-netfilter.sh`, a file-backed
 * fake of iptables / ip6tables / iptables-restore / docker, so its real logic runs without root or netfilter:
 * range validation, fail-closed apply, rule positions, the check, and the daily refresh's alerts (heartbeats).
 * Lists reach bash through environment variables (LIST, OLD, NEW, STATE_LIST, SEED_LIST, FETCHED).
 */
const root = path.resolve(import.meta.dirname, "..");
const unix = (file: string) => file.replaceAll("\\", "/");
const script = unix(path.join(root, "infra", "host", "moz-origin-firewall"));
const fake = unix(path.join(root, "scripts", "lib", "fake-netfilter.sh"));
const seedFile = path.join(root, "infra", "host", "files", "cloudflare-ips-v4.txt");
const bash = findBash();
// Each test spawns bash several times: well under a second on Linux, but Git for Windows forks slowly and a
// full parallel unit run pushed one test past the 5 s default.
vi.setConfig({ testTimeout: 30_000 });
const hasJq = spawnSync(bash, ["-c", "command -v jq"]).status === 0;

const SEED = readFileSync(seedFile, "utf8")
  .split("\n")
  .map((line) => line.replace(/#.*/, "").trim())
  .filter(Boolean);
const lines = (ranges: string[]) => ranges.join("\n") + "\n";
/** SEED with its first `n` ranges replaced by documentation-free public /16s. */
const swapped = (n: number) => [
  ...SEED.slice(n),
  ...Array.from({ length: n }, (_, i) => `45.${i}.0.0/16`),
];

const INBOUND = "-A DOCKER-USER -o moz-stg-in -j MOZ-ORIGIN";
const OUTBOUND =
  "-A DOCKER-USER -i moz-stg-in -m conntrack ! --ctstate RELATED,ESTABLISHED -j DROP";
const EMERGENCY = "-A DOCKER-USER -o moz-stg-in -j DROP";

// Shell snippets for test setup.
const SEED_IN = 'printf "%s" "$SEED_LIST" >"$SEED"';
const STATE_IN = 'printf "%s" "$STATE_LIST" >"$STATE"';
const FORWARD_IN = `iptables -N FORWARD; echo "-A FORWARD -j DOCKER-USER" >"$FAKE/v4/FORWARD"`;

let dir: string;
beforeEach(() => {
  dir = unix(mkdtempSync(path.join(tmpdir(), "moz-origin-fw-")));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

type Run = { status: number | null; stdout: string; stderr: string };
function run(body: string, env: Record<string, string> = {}, input = ""): Run {
  const result = spawnSync(bash, ["-c", `source "$1"; source "$2"; ${body}`, "_", script, fake], {
    input,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, FAKE: dir, SEED_LIST: lines(SEED), ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const fileLines = (name: string): string[] | null => {
  try {
    return readFileSync(path.join(dir, name), "utf8").split("\n").filter(Boolean);
  } catch {
    return null;
  }
};
const chain = (name: string, family = "v4") => fileLines(`${family}/${name}`);
const ranges443 = () => (chain("MOZ-ORIGIN") ?? []).filter((rule) => rule.includes("--dport 443"));

describe("[P0-15] moz-origin-firewall range validation", () => {
  const validate = (list: string) => run('valid_ranges <<<"$LIST"', { LIST: list });

  it("[P0-15] accepts the committed seed: Cloudflare's 15 IPv4 ranges, sorted", () => {
    const result = validate(readFileSync(seedFile, "utf8"));
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual([...SEED].sort());
    expect(SEED).toHaveLength(15);
  });

  it.each([
    ["104.16.0.0/10", "wider than /11"],
    ["104.16.0.0/25", "narrower than /24"],
    ["104.16.0.1/13", "host bits set"],
    ["104.016.0.0/13", "leading zero"],
    ["104.256.0.0/16", "octet over 255"],
    ["2400:cb00::/32", "IPv6"],
    ["104.16.0.0", "no prefix"],
    ["10.4.0.0/16", "private 10/8"],
    ["172.20.0.0/14", "private 172.16/12"],
    ["192.168.0.0/16", "private 192.168/16"],
    ["100.64.0.0/12", "CGNAT 100.64/10"],
    ["127.0.0.0/16", "loopback"],
    ["169.254.0.0/16", "link-local"],
    ["0.0.0.0/11", "this network"],
    ["224.0.0.0/11", "multicast"],
    ["240.0.0.0/12", "reserved 240/4"],
    ["172.0.0.0/11", "a wide range that swallows 172.16/12"],
    ["1.2.3.0/24;reboot", "shell junk"],
  ])("[P0-15] rejects the whole list when one line is %s (%s)", (bad) => {
    const result = validate(lines([...SEED, bad]));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
  });

  it("[P0-15] rejects fewer than 5 or more than 64 ranges", () => {
    expect(validate(lines(SEED.slice(0, 4))).status).toBe(1);
    const many = Array.from({ length: 65 }, (_, i) => `45.${i}.0.0/16`);
    expect(validate(lines(many)).status).toBe(1);
    expect(validate(lines(many.slice(0, 64))).status).toBe(0);
  });

  it("[P0-15] measures change as ranges added plus removed over the old count", () => {
    const pct = (next: string[]) =>
      run('change_pct "$OLD" "$NEW"', { OLD: lines(SEED), NEW: lines(next) }).stdout.trim();
    expect(pct(SEED)).toBe("0");
    expect(pct(swapped(1))).toBe("13");
    expect(pct(swapped(4))).toBe("53");
  });
});

describe("[P0-15] moz-origin-firewall apply", () => {
  it("[P0-15] loads every range as a tcp/443 RETURN, ICMP errors, then DROP, and pins both rules on top", () => {
    const result = run(`${SEED_IN}; cmd_apply`);
    expect(result.status).toBe(0);
    const rules = chain("MOZ-ORIGIN")!;
    expect(rules).toHaveLength(SEED.length + 2);
    for (const cidr of SEED) {
      expect(rules).toContain(`-A MOZ-ORIGIN -s ${cidr} -p tcp -m tcp --dport 443 -j RETURN`);
    }
    expect(rules.at(-2)).toBe("-A MOZ-ORIGIN -p icmp -m conntrack --ctstate RELATED -j RETURN");
    expect(rules.at(-1)).toBe("-A MOZ-ORIGIN -j DROP");
    expect(chain("DOCKER-USER")).toEqual([INBOUND, OUTBOUND]);
    // One transaction that declares (and so flushes) only MOZ-ORIGIN in the filter table.
    const restore = fileLines("restore")!;
    expect(restore.slice(0, 2)).toEqual(["*filter", ":MOZ-ORIGIN - [0:0]"]);
    expect(restore.filter((line) => line.startsWith(":"))).toHaveLength(1);
    expect(restore.at(-1)).toBe("COMMIT");
  });

  it("[P0-15] prefers the last good list over the seed", () => {
    const result = run(`${SEED_IN}; ${STATE_IN}; cmd_apply`, {
      STATE_LIST: lines(SEED.slice(0, 6)),
    });
    expect(result.status).toBe(0);
    expect(ranges443()).toHaveLength(6);
  });

  it("[P0-15] is idempotent and keeps our rules above anything else in DOCKER-USER", () => {
    const result = run(
      `${SEED_IN}; iptables -N DOCKER-USER; iptables -I DOCKER-USER 1 -j RETURN; cmd_apply; cmd_apply`,
    );
    expect(result.status).toBe(0);
    expect(chain("DOCKER-USER")).toEqual([INBOUND, OUTBOUND, "-A DOCKER-USER -j RETURN"]);
    // The setup's insert plus our two; the second apply found both in place.
    expect(fileLines("calls")!.filter((call) => call.startsWith("-I DOCKER-USER"))).toHaveLength(3);
  });

  it("[P0-15] moves our rules back to the top and removes stale copies and the emergency DROP", () => {
    const existing = ["-A DOCKER-USER -s 203.0.113.0/24 -j ACCEPT", INBOUND, OUTBOUND, EMERGENCY];
    const result = run(
      `${SEED_IN}; iptables -N DOCKER-USER; printf "%s" "$EXISTING" >"$FAKE/v4/DOCKER-USER"; cmd_apply`,
      { EXISTING: lines(existing) },
    );
    expect(result.status).toBe(0);
    expect(chain("DOCKER-USER")).toEqual([INBOUND, OUTBOUND, existing[0]]);
  });

  it("[P0-15] fails closed with no list: MOZ-ORIGIN is a single DROP, rules pinned, exit 1", () => {
    const result = run("cmd_apply");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/failing closed/);
    expect(chain("MOZ-ORIGIN")).toEqual(["-A MOZ-ORIGIN -j DROP"]);
    expect(chain("DOCKER-USER")).toEqual([INBOUND, OUTBOUND]);
  });

  it("[P0-15] fails closed on an invalid last good list (never falls back to the older seed)", () => {
    const result = run(`${SEED_IN}; ${STATE_IN}; cmd_apply`, {
      STATE_LIST: lines([...SEED, "10.0.0.0/16"]),
    });
    expect(result.status).toBe(1);
    expect(chain("MOZ-ORIGIN")).toEqual(["-A MOZ-ORIGIN -j DROP"]);
  });

  it("[P0-15] drops all traffic to the bridge when the chain can't be loaded, and recovers on the next apply", () => {
    const failed = run(`${SEED_IN}; cmd_apply`, { FAKE_FAIL_RESTORE: "1" });
    expect(failed.status).toBe(1);
    expect(failed.stderr).toMatch(/dropping all traffic to moz-stg-in/);
    expect(chain("MOZ-ORIGIN")).toBeNull();
    // The outbound DROP got in before the jump to the missing chain failed; both only drop.
    expect(chain("DOCKER-USER")).toEqual([EMERGENCY, OUTBOUND]);
    const recovered = run(`${SEED_IN}; cmd_apply`);
    expect(recovered.status).toBe(0);
    expect(chain("DOCKER-USER")).toEqual([INBOUND, OUTBOUND]);
  });

  it("[P0-15] refuses IPv6 to the bridge when ip6tables has DOCKER-USER", () => {
    const result = run(`${SEED_IN}; ip6tables -N DOCKER-USER; cmd_apply; cmd_apply`);
    expect(result.status).toBe(0);
    expect(chain("DOCKER-USER", "v6")).toEqual(["-A DOCKER-USER -o moz-stg-in -j DROP"]);
  });

  it("[P0-15] touches nothing unless iptables is the nf_tables variant", () => {
    const result = run(`${SEED_IN}; cmd_apply`, { FAKE_VARIANT: "iptables v1.8.10 (legacy)" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not the nf_tables variant/);
    expect(chain("DOCKER-USER")).toBeNull();
  });
});

describe("[P0-15] moz-origin-firewall check", () => {
  const applied = `${SEED_IN}; ${FORWARD_IN}; cmd_apply;`;

  it("[P0-15] passes after apply with FORWARD jumping to DOCKER-USER", () => {
    const result = run(`${applied} cmd_check`);
    expect(result.stderr).toMatch(/ok \(15 ranges\)/);
    expect(result.status).toBe(0);
  });

  it.each([
    ["no FORWARD jump", 'rm "$FAKE/v4/FORWARD"', /FORWARD does not jump/],
    ["our rules swapped", 'printf "%s" "$SWAP" >"$FAKE/v4/DOCKER-USER"', /rules 1–2/],
    ["another rule on top", "iptables -I DOCKER-USER 1 -j ACCEPT", /rules 1–2/],
    ["a closed chain", 'echo "-A MOZ-ORIGIN -j DROP" >"$FAKE/v4/MOZ-ORIGIN"', /has 0 ranges/],
    ["no final DROP", 'sed -i "\\$d" "$FAKE/v4/MOZ-ORIGIN"', /does not end in DROP/],
    ["legacy iptables", "export FAKE_VARIANT=legacy", /not the nf_tables variant/],
  ])("[P0-15] fails with %s", (_name, damage, message) => {
    const result = run(`${applied} ${damage}; cmd_check`, { SWAP: lines([OUTBOUND, INBOUND]) });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(message);
  });
});

describe("[P0-15] moz-origin-firewall refresh", () => {
  /** cmd_refresh with fetch_ranges faked: prints $FETCHED, or fails when `fetched` is null. */
  const refresh = (setup: string, fetched: string[] | null, env: Record<string, string> = {}) =>
    run(`${setup}; fetch_ranges() { [[ -n $FETCHED ]] && printf "%s" "$FETCHED"; }; cmd_refresh`, {
      FETCHED: fetched ? lines(fetched) : "",
      ...env,
    });
  const withState = (age = "now") => `${FORWARD_IN}; ${STATE_IN}; touch -d "${age}" "$STATE"`;
  const stateEnv = { STATE_LIST: lines(SEED) };
  const heartbeats = () =>
    (fileLines("docker") ?? []).map((call) => call.match(/host:[a-z-]+/)?.[0]).join(",");
  const state = () => fileLines("state");

  it("[P0-15] stores a first list, applies it and records host:origin-firewall in the staging DB", () => {
    const result = refresh(`${FORWARD_IN}; ${SEED_IN}`, SEED);
    expect(result.status).toBe(0);
    expect(state()).toEqual([...SEED].sort());
    expect(ranges443()).toHaveLength(15);
    expect(heartbeats()).toBe("host:origin-firewall");
    expect(fileLines("docker")![0]).toMatch(
      /^exec -i -u postgres moz-staging-postgres-1 psql .* -d moz /,
    );
    expect(result.stderr).toMatch(/stored the first range list/);
  });

  it("[P0-15] the first refresh is held to the seed: a list > 25% different is refused and alerted", () => {
    const result = refresh(`${FORWARD_IN}; ${SEED_IN}`, swapped(4));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/changed by 53%/);
    expect(state()).toBeNull();
    expect(ranges443()).toHaveLength(15);
    expect(heartbeats()).toBe("host:origin-firewall-failed");
  });

  it("[P0-15] confirms an unchanged list by renewing its age", () => {
    const result = refresh(withState("6 days ago"), SEED, stateEnv);
    expect(result.status).toBe(0);
    expect(run("list_age_days", { STATE_LIST: "" }).stdout.trim()).toBe("0");
    expect(result.stderr).not.toMatch(/range list changed/);
  });

  it("[P0-15] accepts a change of up to 25% and logs it", () => {
    const result = refresh(withState(), swapped(1), stateEnv);
    expect(result.status).toBe(0);
    expect(state()).toEqual([...swapped(1)].sort());
    expect(result.stderr).toMatch(/range list changed: .*45\.0\.0\.0\/16/);
    expect(heartbeats()).toBe("host:origin-firewall");
  });

  it("[P0-15] keeps the old list and alerts on a change over 25%", () => {
    const result = refresh(withState(), swapped(4), stateEnv);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/changed by 53%/);
    expect(state()).toEqual(SEED);
    expect(ranges443()).toHaveLength(15);
    expect(ranges443().join()).not.toContain("45.0.0.0");
    expect(heartbeats()).toBe("host:origin-firewall-failed");
  });

  it("[P0-15] keeps the old list and alerts when Cloudflare's list fails validation", () => {
    const result = refresh(withState(), [...SEED, "10.0.0.0/16"], stateEnv);
    expect(result.status).toBe(1);
    expect(state()).toEqual(SEED);
    expect(heartbeats()).toBe("host:origin-firewall-failed");
  });

  it("[P0-15] a failed fetch keeps the list without an alert while it is ≤ 7 days old", () => {
    const result = refresh(withState("6 days ago"), null, stateEnv);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/kept the last good list \(6 days old\)/);
    expect(heartbeats()).toBe("");
    expect(ranges443()).toHaveLength(15);
  });

  it("[P0-15] a failed fetch alerts once the last good list is over 7 days old", () => {
    const result = refresh(withState("8 days ago"), null, stateEnv);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/8 days old/);
    expect(heartbeats()).toBe("host:origin-firewall-failed");
    expect(ranges443()).toHaveLength(15);
  });

  it("[P0-15] alerts when the check fails after apply", () => {
    const result = refresh(SEED_IN, SEED);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/FORWARD does not jump/);
    expect(heartbeats()).toBe("host:origin-firewall-failed");
  });

  it.skipIf(!hasJq)("[P0-15] reads ipv4_cidrs only from a successful API answer", () => {
    const fetch = (body: unknown) =>
      run('curl() { printf "%s" "$BODY"; }; fetch_ranges', {
        BODY: typeof body === "string" ? body : JSON.stringify(body),
      });
    const ok = fetch({
      success: true,
      result: { ipv4_cidrs: SEED, ipv6_cidrs: ["2400:cb00::/32"] },
    });
    expect(ok.status).toBe(0);
    expect(ok.stdout.trim().split("\n")).toEqual(SEED);
    expect(fetch({ success: false, result: { ipv4_cidrs: SEED } }).status).not.toBe(0);
    expect(fetch({ success: true, result: { ipv4_cidrs: [] } }).status).not.toBe(0);
    expect(fetch({ success: true, result: { ipv4_cidrs: "104.16.0.0/13" } }).status).not.toBe(0);
    expect(fetch("<html>").status).not.toBe(0);
  });
});

describe("[P0-15] moz-origin-firewall host wiring", () => {
  it("[P0-15] refuses to run as anyone but root", () => {
    const result = spawnSync(bash, [script, "check"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/run as root/);
  });

  it("[P0-15] Docker uses its iptables backend, which the rules are written for", () => {
    const daemon = JSON.parse(
      readFileSync(path.join(root, "infra", "docker", "daemon.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(daemon["firewall-backend"]).toBe("iptables");
  });
});
