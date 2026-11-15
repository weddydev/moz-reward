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
mkdir tls logs
cp origin.crt origin.key tls/
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
  // Files go in with `docker cp` (no bind mounts: paths differ on Windows); same paths as infra/compose.
  docker([
    "create",
    "--name",
    NAME,
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
  spawnSync("docker", ["rm", "-f", NAME]);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

type Outcome = { status: number } | { error: string };
type Opts = { sni: string; host?: string; client?: "client" | "stranger" | null; auth?: boolean };

/** One HTTPS request with explicit SNI, Host and client certificate; resolves with the status or the error. */
function request(o: Opts, attempt = 0): Promise<Outcome> {
  const client = o.client === undefined ? "client" : o.client;
  return new Promise((resolve) => {
    const req = https.request(
      {
        host: "127.0.0.1",
        port,
        path: "/",
        servername: o.sni,
        ca: file("origin-ca.crt"),
        checkServerIdentity: () => undefined,
        headers: {
          Host: o.host ?? o.sni,
          ...(o.auth ? { Authorization: `Basic ${btoa(`${USER}:${PASSWORD}`)}` } : {}),
        },
        ...(client ? { cert: file(`${client}.crt`), key: file(`${client}.key`) } : {}),
        agent: false,
        timeout: 10_000,
      },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0 });
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
  it("[P0-15] with the origin-pull certificate, the app's name reaches basic auth (401), then the app (502: no upstream here)", async () => {
    expect(await request({ sni: APP })).toEqual({ status: 401 });
    expect(await request({ sni: APP, auth: true })).toEqual({ status: 502 });
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
