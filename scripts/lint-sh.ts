/**
 * `pnpm lint:sh` (P0-15): ShellCheck on the host scripts that run as root on the VPS (infra/host) and on
 * scripts/image-check.sh. The one
 * definition used by CI (ci.yml, image job) and by `pnpm gate:task`, in the pinned image (no local install).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

export const SHELLCHECK_IMAGE =
  "koalaman/shellcheck:v0.10.0@sha256:2097951f02e735b613f4a34de20c40f937a6c8f18ecb170612c88c34517221fb";

/** Repo-relative: the root scripts for the VPS and the image check CI and the production deploy share. */
export const SCRIPTS = [
  "infra/host/harden.sh",
  "infra/host/moz-deploy",
  "infra/host/moz-backup",
  "infra/postgres/moz-walg",
  "scripts/image-check.sh",
];

const repoDir = path.resolve(import.meta.dirname, "..");
const run = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--network",
    "none",
    "-v",
    `${repoDir}:/mnt:ro`,
    SHELLCHECK_IMAGE,
    "--shell=bash",
    "--external-sources",
    "--severity=style",
    "--format=gcc",
    ...SCRIPTS.map((s) => `/mnt/${s}`),
  ],
  { stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
);
if (run.error) {
  console.error(`lint:sh: could not run Docker (${run.error.message}). Start Docker Desktop.`);
  process.exit(1);
}
if (run.status === 0) console.warn(`lint:sh: ${SCRIPTS.length} scripts clean`);
process.exit(run.status ?? 1);
