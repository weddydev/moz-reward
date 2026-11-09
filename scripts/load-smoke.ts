/**
 * `pnpm test:load:smoke` — runs tests/load/smoke.js with a local `k6` if installed, otherwise with the
 * pinned grafana/k6 Docker image (no install needed). Env: BASE_URL, VUS, DURATION.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const K6_IMAGE = "grafana/k6:1.0.0";
const script = path.resolve("tests/load/smoke.js");
const passEnv = ["BASE_URL", "VUS", "DURATION"].filter((k) => process.env[k]);

const hasK6 =
  spawnSync("k6", ["version"], { stdio: "ignore", shell: process.platform === "win32" }).status ===
  0;
let result;
if (hasK6) {
  result = spawnSync("k6", ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
} else {
  // Inside Docker, "localhost" is the container; reach the host app via host.docker.internal.
  const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(
    /\/\/(localhost|127\.0\.0\.1)/,
    "//host.docker.internal",
  );
  const args = [
    "run",
    "--rm",
    "-i",
    "--add-host=host.docker.internal:host-gateway",
    "-e",
    `BASE_URL=${baseUrl}`,
  ];
  for (const k of passEnv.filter((k) => k !== "BASE_URL"))
    args.push("-e", `${k}=${process.env[k]}`);
  args.push("-v", `${path.dirname(script)}:/scripts:ro`, K6_IMAGE, "run", "/scripts/smoke.js");
  console.warn(`[load] k6 not installed; using ${K6_IMAGE} against ${baseUrl}`);
  result = spawnSync("docker", args, { stdio: "inherit" });
}
process.exit(result.status ?? 1);
