import { type ChildProcess, spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

/**
 * P1-10 (C-28): the shutdown wiring in a real process. SIGTERM reaches `registerRealtimeShutdown`, which gives
 * the open stream a jittered `retry:` (1–11 s) and a `closed: restart` event, then closes it. (Spread over 100
 * streams is in the hub's unit tests; Next's own SIGTERM handler runs beside this one, NEXT_MANUAL_SIG_HANDLE
 * unset.)
 */
let child: ChildProcess | undefined;
afterEach(() => {
  child?.kill("SIGKILL");
  child = undefined;
});

describe("[P1-10] realtime shutdown in a real process", () => {
  it.skipIf(process.platform === "win32")(
    "SIGTERM: the open stream gets a jittered retry and closes",
    async () => {
      let out = "";
      const proc = spawn(
        process.execPath,
        [
          "--import",
          "./tests/support/exit-with-parent.mjs",
          "--import",
          "tsx",
          "--import",
          "./scripts/server-only-hook.mjs",
          "tests/support/realtime-shutdown-child.ts",
        ],
        { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] },
      );
      child = proc;
      proc.stdout.on("data", (c: Buffer) => (out += c.toString()));
      proc.stderr.on("data", (c: Buffer) => (out += c.toString()));
      const until = async (re: RegExp, ms: number): Promise<void> => {
        const end = Date.now() + ms;
        while (!re.test(out)) {
          if (Date.now() > end) throw new Error(`timed out on ${String(re)}:\n${out.slice(-2000)}`);
          await new Promise((r) => setTimeout(r, 25));
        }
      };
      await until(/event: (ready|degraded)/, 20_000);
      const exited = new Promise<number | null>((resolve) => proc.on("exit", resolve));
      proc.kill("SIGTERM");
      await until(/STREAM-CLOSED/, 10_000);
      expect(await exited).toBe(0);
      const retry = /retry: (\d+)\\nevent: closed\\ndata: \{"reason":"restart"\}/.exec(out);
      expect(retry, out).not.toBeNull();
      const ms = Number(retry?.[1]);
      expect(ms).toBeGreaterThanOrEqual(1_000);
      expect(ms).toBeLessThan(11_000);
    },
    40_000,
  );
});
