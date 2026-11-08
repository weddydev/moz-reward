/**
 * `pnpm services:up` / `pnpm services:down` (P0-02): local Postgres, Redis, Mailpit and MinIO.
 * Pre-flight turns the two common failures into clear messages instead of raw Docker errors:
 *  - Docker CLI missing or the daemon not running;
 *  - a port already taken by something other than our own containers (e.g. a Windows Postgres service).
 */
import { spawnSync } from "node:child_process";
import { connect } from "node:net";
import { isDirectRun } from "../src/lib/is-direct-run";

export const COMPOSE_FILE = "infra/docker-compose.dev.yml";

/** Host ports published by the compose file (127.0.0.1 only). Keep in sync with infra/docker-compose.dev.yml. */
export const SERVICE_PORTS: readonly { service: string; port: number; what: string }[] = [
  { service: "postgres", port: 5432, what: "Postgres" },
  { service: "redis", port: 6379, what: "Redis" },
  { service: "mailpit", port: 1025, what: "Mailpit SMTP" },
  { service: "mailpit", port: 8025, what: "Mailpit web/API" },
  { service: "minio", port: 9000, what: "MinIO S3 API" },
  { service: "minio", port: 9001, what: "MinIO console" },
];

export type DockerState = "ok" | "no-cli" | "no-daemon";

export function dockerProblem(state: DockerState): string | null {
  if (state === "no-cli")
    return "Docker is not installed or not on PATH. Install Docker Desktop, open it once, then run `pnpm services:up` again.";
  if (state === "no-daemon")
    return "Docker is installed but not running. Start Docker Desktop, wait until it says it is running, then run `pnpm services:up` again.";
  return null;
}

/** Ports in use by something else: listening, but the compose service that owns the port is not running. */
export function portConflicts(
  listening: ReadonlySet<number>,
  runningServices: ReadonlySet<string>,
): string[] {
  return SERVICE_PORTS.filter((p) => listening.has(p.port) && !runningServices.has(p.service)).map(
    (p) => `  - ${String(p.port)} (${p.what}) is already in use by another program`,
  );
}

// No shell: `docker` is a real executable on every OS, and arguments must not be re-parsed by a shell.
const run = (args: string[], inherit = false): { status: number | null; stdout: string } => {
  const r = spawnSync("docker", args, { encoding: "utf8", stdio: inherit ? "inherit" : "pipe" });
  return { status: r.error ? null : r.status, stdout: r.stdout };
};

function dockerState(): DockerState {
  if (run(["--version"]).status !== 0) return "no-cli";
  return run(["info", "--format", "{{.ServerVersion}}"]).status === 0 ? "ok" : "no-daemon";
}

function runningServices(): Set<string> {
  const r = run(["compose", "-f", COMPOSE_FILE, "ps", "--status", "running", "--services"]);
  return new Set(r.stdout.split(/\r?\n/).filter(Boolean));
}

const isListening = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const done = (result: boolean): void => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500, () => {
      done(false);
    });
    socket.once("connect", () => {
      done(true);
    });
    socket.once("error", () => {
      done(false);
    });
  });

async function up(): Promise<number> {
  const problem = dockerProblem(dockerState());
  if (problem) {
    console.error(`[services] ${problem}`);
    return 1;
  }
  const ports = [...new Set(SERVICE_PORTS.map((p) => p.port))];
  const listening = new Set<number>();
  for (const port of ports) if (await isListening(port)) listening.add(port);
  const conflicts = portConflicts(listening, runningServices());
  if (conflicts.length > 0) {
    console.error(
      `[services] Port conflict:\n${conflicts.join("\n")}\nStop that program (see README "Local setup" → Port conflicts), then run \`pnpm services:up\` again.`,
    );
    return 1;
  }
  const status = run(["compose", "-f", COMPOSE_FILE, "up", "-d", "--wait"], true).status;
  if (status !== 0)
    console.error(
      '[services] `docker compose up` failed (output above). If it mentions a port or bind, see README "Local setup" → Port conflicts.',
    );
  return status ?? 1;
}

function down(): number {
  const problem = dockerProblem(dockerState());
  if (problem) {
    console.error(`[services] ${problem}`);
    return 1;
  }
  return run(["compose", "-f", COMPOSE_FILE, "down"], true).status ?? 1;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "up") process.exit(await up());
  if (command === "down") process.exit(down());
  console.error("Usage: tsx scripts/services.ts up|down");
  process.exit(2);
}

if (isDirectRun(import.meta.url)) void main();
