import { type ChildProcess, spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { systemScope } from "@/server/authz/scope";
import { writeOutbox } from "@/server/jobs/outbox";
import { transaction } from "@/server/repos/_base";
import { testEmail } from "../fixtures/auth";
import { makeUser } from "../fixtures/factories";
import { latestEmailTo } from "../support/mailpit";

/**
 * The real `pnpm worker` process (P0-18), not the in-test workers: Vitest stubs `server-only` and never sets
 * the react-server condition, so only a spawned process proves the entry point can load and run handlers
 * (under that condition react-dom/server refuses to render emails; scripts/server-only-hook.mjs fixes it).
 */
let child: ChildProcess | undefined;

afterEach(() => {
  child?.kill("SIGKILL");
  child = undefined;
});

function startWorker(): { proc: ChildProcess; output: () => string; started: Promise<void> } {
  let out = "";
  const proc = spawn(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "--import",
      "./scripts/server-only-hook.mjs",
      "src/worker/index.ts",
    ],
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
  it("starts, relays an outbox row to its handler (real email render + send), and stops gracefully on SIGTERM", async () => {
    const worker = startWorker();
    child = worker.proc;
    await worker.started;

    const user = await makeUser({ email: testEmail("worker-process") });
    const scope = systemScope("test: worker process");
    await transaction(scope, (tx) =>
      writeOutbox(scope, tx, "email", "staff-lockout", {
        userId: user.id,
        reason: "second-factor",
      }),
    );
    const mail = await latestEmailTo(user.email, { timeoutMs: 20_000 });
    expect(mail.subject).toBe("Several wrong codes were tried on your Moz Rewards staff account");

    const exited = new Promise<number | null>((resolve) => worker.proc.on("exit", resolve));
    worker.proc.kill("SIGTERM");
    expect(await exited).toBe(0);
    expect(worker.output()).toContain('"event":"worker.stopped"');
    expect(worker.output()).not.toContain("job.retrying");
  }, 60_000);
});
