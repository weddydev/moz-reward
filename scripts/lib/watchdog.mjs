// Gate step watchdog (21 Nov 2026): `node watchdog.mjs <timeout ms> <cmd> [args…]`.
//
// Runs one gate step and kills its whole process tree if it runs past the timeout, so a hung step fails in
// minutes with a clear message instead of blocking the gate for good (gate 21 Nov: the integration run wrote
// its report, then its process never exited and the gate waited ~55 min). `spawnSync`'s own `timeout` is not
// enough on Windows: pnpm runs through cmd.exe there, and killing the shell leaves the child holding the pipe.
//
// - Output is passed through unchanged; exit code is the step's own.
// - On timeout: a `[gate] TIMED OUT` line on stderr, the tree is killed (taskkill /T on Windows, the process
//   group elsewhere), exit 124.
// - When the step exits but a stray grandchild keeps its output pipe open, the watchdog still exits after 10 s.
// - `GATE_WATCHDOG_SHELL=1`: run through a shell (pnpm.cmd on Windows); the caller has checked the arguments.
// Plain JavaScript so it starts without tsx.
import { spawn, spawnSync } from "node:child_process";

const [, , ms, cmd, ...args] = process.argv;
const timeoutMs = Number(ms);
if (!cmd || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  process.stderr.write("usage: node watchdog.mjs <timeout ms> <cmd> [args…]\n");
  process.exit(2);
}
const win = process.platform === "win32";
const child = spawn(cmd, args, {
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.env.GATE_WATCHDOG_SHELL === "1",
  detached: !win, // own process group, so the whole tree can be killed
  env: process.env,
});
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

function killTree() {
  if (child.pid === undefined) return;
  if (win) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

let done = false;
const finish = (code) => {
  if (done) return;
  done = true;
  clearTimeout(timer);
  process.exitCode = code;
  // Let piped output drain, then leave even if a grandchild still holds a pipe.
  setTimeout(() => process.exit(code), 200).unref();
};

const timer = setTimeout(() => {
  const min = (timeoutMs / 60000).toFixed(1);
  process.stderr.write(
    `\n[gate] TIMED OUT after ${min} min: the step did not finish (a hung process?); killed its process tree\n`,
  );
  killTree();
  finish(124);
}, timeoutMs);

child.on("error", (err) => {
  process.stderr.write(`\n[gate] could not start ${cmd}: ${err.message}\n`);
  finish(127);
});
child.on("close", (code, signal) => finish(code ?? (signal ? 1 : 0)));
child.on("exit", (code, signal) => {
  // "close" waits for the pipes; a stray grandchild can hold them open. Give it 10 s, then go.
  setTimeout(() => {
    if (!done) {
      killTree();
      finish(code ?? (signal ? 1 : 0));
    }
  }, 10_000).unref();
});
