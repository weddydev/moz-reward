import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { systemScope } from "@/server/authz/scope";
import { writeOutbox } from "@/server/jobs/outbox";
import { transaction } from "@/server/repos/_base";
import { bundleCli } from "../../scripts/bundle-cli";
import { testEmail } from "../fixtures/auth";
import { makeUser } from "../fixtures/factories";
import { latestEmailTo } from "../support/mailpit";

/**
 * The real `pnpm worker` process (P0-18), not the in-test workers: Vitest stubs `server-only` and never sets
 * the react-server condition, so only a spawned process proves the entry point can load and run handlers
 * (under that condition react-dom/server refuses to render emails; scripts/server-only-hook.mjs fixes it).
 * P0-15 (C-27): the same test runs the esbuild bundle the runtime image starts (`node dist/cli/worker.mjs`).
 */
let child: ChildProcess | undefined;
let bundleDir = "";

beforeAll(async () => {
  bundleDir = await mkdtemp(path.join(tmpdir(), "moz-cli-"));
  await bundleCli(bundleDir);
}, 120_000);

afterAll(async () => {
  if (bundleDir) await rm(bundleDir, { recursive: true, force: true });
});

afterEach(() => {
  child?.kill("SIGKILL");
  child = undefined;
});

type Entry = "source" | "bundle";

function startWorker(entry: Entry): {
  proc: ChildProcess;
  output: () => string;
  started: Promise<void>;
} {
  let out = "";
  // One process (tsx as a loader, not its CLI): the CLI starts the worker as a grandchild, which a failed
  // test's SIGKILL left running, consuming later runs' jobs (P0-20). Same hook as `pnpm worker`.
  // exit-with-parent: if this test process is killed, the worker follows (no orphan reads the test DB).
  const run =
    entry === "source"
      ? ["--import", "tsx", "--import", "./scripts/server-only-hook.mjs", "src/worker/index.ts"]
      : [path.join(bundleDir, "worker.mjs")];
  const proc = spawn(
    process.execPath,
    ["--import", "./tests/support/exit-with-parent.mjs", ...run],
    // Same database and Redis prefix as this test worker (set by tests/setup.integration.ts).
    { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] },
  );
  const started = new Promise<void>((resolve, reject) => {
    const onData = (chunk: Buffer): void => {
      out += chunk.toString();
      if (out.includes('"event":"worker.started"')) resolve();
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", (code) => {
      reject(new Error(`worker exited early (${String(code)}):\n${out.slice(-2000)}`));
    });
  });
  return { proc, output: () => out, started };
}

describe("[P0-18] worker process", () => {
  it.each<Entry>(["source", "bundle"])(
    "%s: starts, relays an outbox row to its handler (real email render + send), and stops gracefully on SIGTERM",
    async (entry) => {
      const worker = startWorker(entry);
      child = worker.proc;
      await worker.started;

      const user = await makeUser({ email: testEmail(`worker-process-${entry}`) });
      const scope = systemScope("test: worker process");
      await transaction(scope, (tx) =>
        writeOutbox(scope, tx, "email", "staff-lockout", {
          userId: user.id,
          reason: "second-factor",
        }),
      );
      const mail = await latestEmailTo(user.email, { timeoutMs: 20_000 });
      expect(mail.subject).toBe("Several wrong codes were tried on your Moz Rewards staff account");

      expect(worker.output()).not.toContain("job.retrying");
      // Windows has no SIGTERM: `kill` ends the process at once, so the graceful stop can only be proved on
      // macOS and Linux (CI and the VPS run Linux). The start, relay and email parts above run everywhere.
      if (process.platform === "win32") return;
      const exited = new Promise<number | null>((resolve) => worker.proc.on("exit", resolve));
      worker.proc.kill("SIGTERM");
      expect(await exited).toBe(0);
      expect(worker.output()).toContain('"event":"worker.stopped"');
      expect(worker.output()).not.toContain("job.retrying");
    },
    60_000,
  );
});
