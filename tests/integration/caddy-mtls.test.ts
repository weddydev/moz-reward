import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import https from "node:https";
import path from "node:path";
import tls from "node:tls";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findBash } from "../../scripts/lib/find-bash";

/**
 * P0-15 C1b item 8: the staging origin lock's TLS wall, with the real Caddyfile.staging + common.caddy in the
 * pinned Caddy image. A test CA stands in for Cloudflare's origin-pull CA (the client side of Authenticated
 * Origin Pulls) and another for the Origin CA (the server side). Caddy must refuse a client without a
 * certificate, or with one from another CA, and TLS 1.1; with the right client certificate, SNI and Host decide:
 * Host ≠ SNI → 421, another name → 404, the app's name → basic auth (401), and with the password the request
 * reaches the (absent) app upstream → 502. The host firewall (moz-origin-firewall) is tested separately.
 */
const root = path.resolve(import.meta.dirname, "..", "..");
const CADDY =
  "caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0";
const NAME = `moz-caddy-mtls-${String(process.pid)}`;
// An echo upstream answering for web-1/web-2: its body shows the Authorization header the app would receive.
const NET = `${NAME}-net`;
const UP = `${NAME}-up`;
const APP = "app.test";
const USER = "moz";
const PASSWORD = "caddy-mtls-test-password";
const bash = findBash();

let dir = "";
let port = 0;
const file = (name: string): string => readFileSync(path.join(dir, name), "utf8");

function docker(args: string[], input?: string): string {
  const r = spawnSync("docker", args, { input, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`docker ${args[0] ?? ""} failed: ${r.stderr.slice(0, 600)}`);
  return r.stdout.trim();
}

beforeAll(() => {
  // Certificates with OpenSSL (Git for Windows' bash on Windows; cygpath gives Node a native path there).
  const made = spawnSync(
    bash,
    [
      "-c",
      String.raw`set -euo pipefail
export MSYS_NO_PATHCONV=1
d=$(mktemp -d); cd "$d"
ca() { openssl req -x509 -new -nodes -newkey ec -pkeyopt ec_paramgen_curve:P-256 -days 30 -subj "/CN=$1" -keyout "$1.key" -out "$1.crt" 2>/dev/null; }
# leaf <name> <ca> <ext line>
leaf() {
  openssl req -new -nodes -newkey ec -pkeyopt ec_paramgen_curve:P-256 -subj "/CN=$1" -keyout "$1.key" -out "$1.csr" 2>/dev/null
  printf '%s\n' "$3" > "$1.ext"
  openssl x509 -req -in "$1.csr" -CA "$2.crt" -CAkey "$2.key" -CAcreateserial -days 30 -extfile "$1.ext" -out "$1.crt" 2>/dev/null
}
ca origin-ca
ca pull-ca
ca other-ca
leaf origin origin-ca "subjectAltName=DNS:${APP},DNS:other.test"
leaf client pull-ca "extendedKeyUsage=clientAuth"
leaf stranger other-ca "extendedKeyUsage=clientAuth"
mkdir tls logs up
cp origin.crt origin.key tls/
printf '%s\n' ':3000 {' '	respond "auth=[{header.Authorization}] uri=[{uri}] rid=[{header.X-Request-Id}]" 200' '}' > up/Caddyfile
if command -v cygpath >/dev/null; then cygpath -m "$d"; else echo "$d"; fi`,
    ],
    { encoding: "utf8" },
  );
  if (made.status !== 0) throw new Error(`certificates: ${made.stderr}`);
  dir = made.stdout.trim();

  const hash = docker(
    ["run", "--rm", "-i", "--network", "none", CADDY, "caddy", "hash-password"],
    `${PASSWORD}\n`,
  );
  docker(["network", "create", NET]);
  docker(["create", "--name", UP, "--network", NET, "--network-alias", "web-1", "--network-alias", "web-2", CADDY, "caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]); // prettier-ignore
  docker(["cp", path.join(dir, "up", "Caddyfile"), `${UP}:/etc/caddy/Caddyfile`]);
  docker(["start", UP]);
  // Files go in with `docker cp` (no bind mounts: paths differ on Windows); same paths as infra/compose.
  docker([
    "create",
    "--name",
    NAME,
    "--network",
    NET,
    "-p",
    "127.0.0.1::443",
    "-e",
    `APP_HOST=${APP}`,
    "-e",
    `BASIC_AUTH_USER=${USER}`,
    "-e",
    `BASIC_AUTH_HASH=${hash}`,
    CADDY,
    "caddy",
    "run",
    "--config",
    "/etc/caddy/Caddyfile",
    "--adapter",
    "caddyfile",
  ]);
  const cp = (src: string, dest: string): string => docker(["cp", src, `${NAME}:${dest}`]);
  cp(path.join(root, "infra/caddy/Caddyfile.staging"), "/etc/caddy/Caddyfile");
  cp(path.join(root, "infra/caddy/common.caddy"), "/etc/caddy/common.caddy");
  cp(path.join(dir, "pull-ca.crt"), "/etc/caddy/cloudflare-origin-pull-ca.pem");
  // Directories copy in whole (created in the container): origin.crt + origin.key, and an empty log dir.
  cp(path.join(dir, "tls"), "/etc/caddy/tls");
  cp(path.join(dir, "logs"), "/var/log/caddy");
  docker(["start", NAME]);
  port = Number(docker(["port", NAME, "443/tcp"]).split(":").pop());
}, 120_000);

afterAll(() => {
  spawnSync("docker", ["rm", "-f", NAME, UP]);
  spawnSync("docker", ["network", "rm", NET]);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** What the echo upstream answers: the Authorization header and URI the app got, and Caddy's request id. */
const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const echoed = (auth: string, uri: string): unknown =>
  expect.stringMatching(
    new RegExp(String.raw`^auth=\[${esc(auth)}\] uri=\[${esc(uri)}\] rid=\[[0-9a-f-]{36}\]$`),
  );

type Outcome = { status: number; body?: string } | { error: string };
type Opts = {
  sni: string;
  host?: string;
  client?: "client" | "stranger" | null;
  auth?: boolean;
  path?: string;
  /** A raw Authorization header (e.g. a Bearer token), instead of the basic-auth password. */
  authorization?: string | string[];
};

/** One HTTPS request with explicit SNI, Host and client certificate; resolves with the status or the error. */
function request(o: Opts, attempt = 0): Promise<Outcome> {
  const client = o.client === undefined ? "client" : o.client;
  return new Promise((resolve) => {
    const req = https.request(
      {
        host: "127.0.0.1",
        port,
        path: o.path ?? "/",
        servername: o.sni,
        ca: file("origin-ca.crt"),
        checkServerIdentity: () => undefined,
        headers: {
          Host: o.host ?? o.sni,
          ...(o.auth ? { Authorization: `Basic ${btoa(`${USER}:${PASSWORD}`)}` } : {}),
          ...(o.authorization ? { Authorization: o.authorization } : {}),
        },
        ...(client ? { cert: file(`${client}.crt`), key: file(`${client}.key`) } : {}),
        agent: false,
        timeout: 10_000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => (body += c));
        res.on("end", () => {
          resolve(res.statusCode === 200 ? { status: 200, body } : { status: res.statusCode ?? 0 });
        });
      },
    );
    req.on("error", (err: NodeJS.ErrnoException) => {
      // Caddy may still be starting after the restart.
      if (err.code === "ECONNREFUSED" || err.code === "ECONNRESET") {
        if (attempt < 20) {
          setTimeout(() => {
            void request(o, attempt + 1).then(resolve);
          }, 250);
          return;
        }
      }
      resolve({ error: err.code ?? err.message });
    });
    req.end();
  });
}

describe("[P0-15] staging Caddy: Cloudflare-only TLS (origin-pull client certificate, SNI = Host)", () => {
  it("[P0-15] with the origin-pull certificate, the app's name reaches basic auth (401), then the app, which never sees the password", async () => {
    expect(await request({ sni: APP })).toEqual({ status: 401 });
    expect(await request({ sni: APP, auth: true })).toEqual({ status: 200, body: echoed("", "/") });
  }, 30_000);

  // 1a (human, 16 Nov): UptimeRobot checks the status-only health URLs without the staging password (production
  // serves them publicly too). Exactly these three raw URIs; anything else, near misses included, keeps basic auth.
  // The app gets the exact path, Caddy's request id (C-23) and Authorization only as one well-formed Bearer token.
  it.each(["/api/health/live", "/api/health/ready", "/api/health/worker"])(
    "[P0-15] %s reaches the app without the staging password; only a Bearer token is passed on",
    async (p) => {
      expect(await request({ sni: APP, path: p })).toEqual({ status: 200, body: echoed("", p) });
      expect(await request({ sni: APP, path: p, authorization: "Bearer health-token-x" })).toEqual({
        status: 200,
        body: echoed("Bearer health-token-x", p),
      });
      for (const authorization of [
        `Basic ${btoa(`${USER}:${PASSWORD}`)}`,
        "basic abc",
        "BASIC abc",
        "Digest abc",
        "Bearer two words",
        "Bearer a, Basic abc",
        ["Bearer health-token-x", `Basic ${btoa(`${USER}:${PASSWORD}`)}`],
      ])
        expect(await request({ sni: APP, path: p, authorization })).toEqual({
          status: 200,
          body: echoed("", p),
        });
    },
    30_000,
  );

  it.each([
    "/api/health",
    "/api/health/",
    "/api/health/ready2",
    "/api/health/ready/x",
    "/api/health/ready%2F..%2F..%2Fadmin",
    "/api/healthz",
    "/api/health/../../admin",
    // Paths that only become a health path once decoded, cleaned, lowercased or merged (security review, 16 Nov).
    "/admin/a%2F..%2F..%2F..%2Fapi%2Fhealth%2Fready",
    "/x%2F..%2Fapi/health/ready",
    "/x/../api/health/ready",
    "/API/HEALTH/LIVE",
    "/api/Health/ready",
    "/api//health/live",
    "/api/health/ready?x=1",
    "/api/health/ready;x",
    "/api/health/%72eady",
  ])("[P0-15] %s still needs the staging password (401)", async (p) => {
    expect(await request({ sni: APP, path: p })).toEqual({ status: 401 });
  });

  it("[P0-15] a Host that differs from the TLS server name is refused (421)", async () => {
    expect(await request({ sni: APP, host: "other.test" })).toEqual({ status: 421 });
  });

  it("[P0-15] any other name gets a 404, never the app", async () => {
    expect(await request({ sni: "other.test" })).toEqual({ status: 404 });
  });

  it.each([
    ["no client certificate", null],
    ["a client certificate from another CA", "stranger"],
  ] as const)("[P0-15] %s: no HTTP answer at all", async (_label, client) => {
    const outcome = await request({ sni: APP, client });
    expect(outcome).not.toHaveProperty("status");
  });

  it("[P0-15] TLS 1.1 is refused (TLS 1.2 and 1.3 only)", async () => {
    const outcome = await new Promise<string>((resolve) => {
      const socket = tls.connect({
        host: "127.0.0.1",
        port,
        servername: APP,
        minVersion: "TLSv1.1",
        maxVersion: "TLSv1.1",
        // Let the client offer TLS 1.1, so a failure is the server's refusal.
        ciphers: "DEFAULT@SECLEVEL=0",
        cert: file("client.crt"),
        key: file("client.key"),
        rejectUnauthorized: false,
      });
      socket.on("secureConnect", () => {
        socket.destroy();
        resolve("connected");
      });
      socket.on("error", (err: NodeJS.ErrnoException) => {
        resolve(err.code ?? err.message);
      });
    });
    expect(outcome).not.toBe("connected");
  });
});
