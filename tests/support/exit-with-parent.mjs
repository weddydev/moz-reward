// Test-only preload (tests/integration/worker-process.test.ts): a spawned worker exits when the test process
// that started it dies. A Vitest run killed mid-test never reaches afterEach, and the orphan (re-parented to
// PID 1) kept relaying the test database's outbox, stealing later runs' rows (found 10 Nov 2026).
// `process.ppid` is read once at start-up in Node 26, so liveness is probed with signal 0 instead.
const parent = process.ppid;
setInterval(() => {
  try {
    process.kill(parent, 0);
  } catch {
    process.exit(1);
  }
}, 1_000).unref();
