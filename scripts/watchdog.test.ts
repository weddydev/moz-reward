/**
 * The gate's step watchdog (21 Nov 2026): a hung step fails fast instead of blocking the gate. Real child
 * processes, short limits (a few seconds), so the timeout and tree-kill paths are shown working on this OS.
 */
import { describe, expect, it } from "vitest";
import { runWatched, stepTimeoutMs, STEP_LIMITS, TIMED_OUT } from "./lib/gate";

const node = process.execPath;
const SECONDS = (s: number): number => s / 60; // minutes, for timeoutMin

describe("[P0-14] gate step watchdog", () => {
  it("[P0-14] passes output and the exit code straight through", () => {
    const ok = runWatched(node, ["-e", "console.log('hello'); console.error('warn')"], {
      timeoutMin: SECONDS(30),
    });
    expect(ok).toMatchObject({ ok: true, timedOut: false });
    expect(ok.output).toContain("hello");
    expect(ok.output).toContain("warn");
    const bad = runWatched(node, ["-e", "process.exit(3)"], { timeoutMin: SECONDS(30) });
    expect(bad).toMatchObject({ ok: false, timedOut: false });
  }, 40_000);

  it("[P0-14] a step that never exits is killed at its limit and reported as TIMED OUT", () => {
    const started = Date.now();
    const r = runWatched(
      node,
      ["-e", "console.log('report written'); setInterval(() => {}, 1000)"],
      {
        timeoutMin: SECONDS(2),
      },
    );
    const took = (Date.now() - started) / 1000;
    expect(r).toMatchObject({ ok: false, timedOut: true });
    expect(r.output).toContain("report written");
    expect(r.output).toContain(TIMED_OUT);
    expect(took).toBeLessThan(15);
  }, 40_000);

  it("[P0-14] the whole tree dies: a grandchild holding the output pipe doesn't keep the step alive", () => {
    // The child starts a grandchild that inherits its stdout and lives for a minute, then hangs itself.
    const script = [
      "const { spawn } = require('node:child_process');",
      "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'inherit' });",
      "setInterval(() => {}, 1000);",
    ].join(" ");
    const started = Date.now();
    const r = runWatched(node, ["-e", script], { timeoutMin: SECONDS(2) });
    expect(r.timedOut).toBe(true);
    expect((Date.now() - started) / 1000).toBeLessThan(20);
  }, 40_000);

  it("[P0-14] a step that exits while a stray grandchild still holds the pipe finishes within ~10 s", () => {
    const script = [
      "const { spawn } = require('node:child_process');",
      "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'inherit' }).unref();",
      "process.exit(0);",
    ].join(" ");
    const started = Date.now();
    const r = runWatched(node, ["-e", script], { timeoutMin: SECONDS(50) });
    expect(r).toMatchObject({ ok: true, timedOut: false });
    expect((Date.now() - started) / 1000).toBeLessThan(25);
  }, 60_000);

  it("[P0-14] limits: minutes → ms, scaled by GATE_TIMEOUT_SCALE; nonsense counts as 1", () => {
    expect(stepTimeoutMs(20, {})).toBe(1_200_000);
    expect(stepTimeoutMs(20, { GATE_TIMEOUT_SCALE: "2" })).toBe(2_400_000);
    expect(stepTimeoutMs(20, { GATE_TIMEOUT_SCALE: "-1" })).toBe(1_200_000);
    expect(stepTimeoutMs(20, { GATE_TIMEOUT_SCALE: "abc" })).toBe(1_200_000);
    expect(stepTimeoutMs(undefined, {})).toBe(STEP_LIMITS.default * 60_000);
    // Every limit is well above a normal run, so only a hung step reaches one.
    expect(STEP_LIMITS.integration).toBeGreaterThanOrEqual(3 * 6);
    expect(STEP_LIMITS.e2eFull).toBeGreaterThanOrEqual(STEP_LIMITS.e2eTask);
  });
});
