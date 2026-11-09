/**
 * `pnpm test:load:smoke` — runs tests/load/smoke.js with a local `k6` if installed, otherwise with the
 * pinned grafana/k6 Docker image (no install needed). Env: BASE_URL, VUS, DURATION.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

// Pinned by digest (ENGINEERING §14); same image as .github/workflows/scheduled.yml.
const K6_IMAGE =
  "grafana/k6:1.0.0@sha256:f21270290d702cbf0a7d6ba5d7ed100b63bcb233b558b885ed787547b3488279";
const script = path.resolve("tests/load/smoke.js");
const passEnv = ["BASE_URL", "VUS", "DURATION"].filter((k) => process.env[k]);

// No shell: k6 is a real executable on every OS. A Windows .cmd shim fails to spawn and falls back to Docker.
const hasK6 = spawnSync("k6", ["version"], { stdio: "ignore" }).status === 0;
let result;
if (hasK6) {
  result = spawnSync("k6", ["run", script], { stdio: "inherit" });
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
