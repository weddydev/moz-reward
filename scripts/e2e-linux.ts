/**
 * `pnpm e2e:linux [playwright args…]` (CLAUDE.md "Linux check", FOLLOWUPS P1-03; built 21 Nov 2026): the same
 * production-build E2E as `pnpm e2e`, with the browsers running in the official Linux image
 * (`mcr.microsoft.com/playwright:v<installed>-noble`, the browsers CI uses), so Linux-only differences (4-core
 * lite tier, fonts, rendering) show up before a push instead of in CI.
 *
 * - The test runner and `next start` stay on this machine; the container runs `playwright run-server` and a
 *   small HTTP forwarder (`lib/e2e-forwarder.mjs`) so the browser reaches the app as http://localhost:3100 (a
 *   non-localhost origin would trip COOP and `upgrade-insecure-requests`, unlike CI). The forwarder reuses a few
 *   keep-alive connections to the host: Docker Desktop stalls new host connections for ~68 s after a few
 *   thousand, which a plain TCP pipe hit every couple of minutes in a gate (C-76).
 * - The container is removed afterwards, also on failure or Ctrl+C.
 * - Example: `pnpm e2e:linux tests/e2e/molten.spec.ts --project desktop1440 --project pixel7`.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pnpmInvocation } from "./lib/gate";
import { isDirectRun } from "../src/lib/is-direct-run";
import { E2E_PORT } from "../tests/e2e/support/server-env";

const NAME = "moz-pw-linux";
const WS_PORT = 3105;

export function playwrightVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = JSON.parse(
    readFileSync(require.resolve("@playwright/test/package.json"), "utf8"),
  ) as {
    version: string;
  };
  return pkg.version;
}

/** The forwarder module's source plus the call that starts it (C-76), for `node --input-type=module -e`. */
export function forwarderScript(appPort: number = E2E_PORT): string {
  const source = readFileSync(new URL("./lib/e2e-forwarder.mjs", import.meta.url), "utf8");
  return `${source}\nawait startForwarder({ listenPort: ${String(appPort)}, upstreamHost: "host.docker.internal", upstreamPort: ${String(appPort)} });\n`;
}

/** Pure: the container command (forwarder + run-server). Only constants and the pinned version go in. */
export function containerArgs(
  version: string,
  appPort: number = E2E_PORT,
  forward: string = forwarderScript(appPort),
): string[] {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`unexpected Playwright version ${version}`);
  return [
    "run",
    "-d",
    "--rm",
    "--name",
    NAME,
    "--init",
    "--ipc=host",
    "--add-host",
    "host.docker.internal:host-gateway",
    "-p",
    `127.0.0.1:${String(WS_PORT)}:${String(WS_PORT)}`,
    "-e",
    `FWD=${forward}`,
    `mcr.microsoft.com/playwright:v${version}-noble`,
    "/bin/sh",
    "-c",
    `node --input-type=module -e "$FWD" & exec npx -y playwright@${version} run-server --port ${String(WS_PORT)} --host 0.0.0.0`,
  ];
}

/**
 * Pure: has `playwright run-server` started listening (from the container's log)? Docker's port proxy accepts
 * TCP on the host as soon as the container starts, long before `npx` has installed and started the server, so
 * an open port proves nothing (a connect then fails with "socket hang up"; seen 21 Nov after a local run).
 */
export function serverListening(logs: string): boolean {
  return /^Listening on ws:\/\//m.test(logs);
}

function containerLogs(): string {
  const r = spawnSync("docker", ["logs", NAME], { encoding: "utf8" });
  return `${r.stdout}${r.stderr}`;
}

function stopContainer(): void {
  spawnSync("docker", ["rm", "-f", NAME], { stdio: "ignore" });
}

const pause = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

export type LinuxBrowsers = { endpoint: string; version: string; stop: () => void };

/**
 * Starts the Linux Playwright server (synchronous, so `gate:task` can use it too) and waits for its own
 * "Listening on" line. Returns the WebSocket endpoint for `PW_WS_ENDPOINT`, or an error to report.
 */
export function startLinuxBrowsers(): LinuxBrowsers | { error: string } {
  const version = playwrightVersion();
  stopContainer();
  const start = spawnSync("docker", containerArgs(version), { encoding: "utf8" });
  if (start.status !== 0)
    return {
      error: `could not start the Linux browser container (is Docker running?): ${start.stderr.trim()}`,
    };
  // First run downloads the Playwright package inside the container (~1 min); later runs are quick.
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (serverListening(containerLogs()))
      return { endpoint: `ws://127.0.0.1:${String(WS_PORT)}/`, version, stop: stopContainer };
    pause(500);
  }
  stopContainer();
  return { error: `the Playwright server in the container did not start (docker logs ${NAME})` };
}

function main(): void {
  const lx = startLinuxBrowsers();
  if ("error" in lx) {
    console.error(`[e2e:linux] ${lx.error}`);
    process.exitCode = 1;
    return;
  }
  process.once("SIGINT", () => {
    lx.stop();
    process.exit(130);
  });
  try {
    console.warn(
      `[e2e:linux] browsers: Linux container (Playwright ${lx.version}); app: this machine :${String(E2E_PORT)}`,
    );
    const inv = pnpmInvocation(["e2e", ...process.argv.slice(2)]);
    // pnpm through cmd.exe only when pnpm's entry is unknown; the arguments are the developer's own.
    // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
    const r = spawnSync(inv.cmd, inv.args, {
      stdio: "inherit",
      shell: inv.shell,
      env: { ...process.env, PW_WS_ENDPOINT: lx.endpoint },
    });
    process.exitCode = r.status ?? 1;
  } finally {
    lx.stop();
  }
}

if (isDirectRun(import.meta.url)) main();
