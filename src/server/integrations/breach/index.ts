import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/server/env";
import { log } from "@/server/log";

/**
 * Breached-password check (P0-06, SECURITY §2) using the Have I Been Pwned range API with k-anonymity: only
 * the first 5 characters of the SHA-1 hash leave the server, and responses are padded. Fails **open** with a
 * warning (a third-party outage must not stop staff setting a password); the result says whether a check
 * actually happened. In APP_ENV=test a fixed fake list is used so tests never touch the network.
 */
export type BreachResult = { breached: boolean; checked: boolean };
type Checker = (password: string) => Promise<BreachResult>;

const RANGE_API = "https://api.pwnedpasswords.com/range/";
const DEFAULT_TIMEOUT_MS = 3_000;

export function createBreachChecker(
  opts: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Checker {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return async (password) => {
    const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    try {
      const res = await doFetch(`${RANGE_API}${prefix}`, {
        headers: { "Add-Padding": "true", "User-Agent": "moz-rewards-password-check" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`range API responded ${String(res.status)}`);
      const breached = (await res.text()).split(/\r?\n/).some((line) => {
        const [candidate, count] = line.trim().split(":");
        return candidate === suffix && Number(count) > 0;
      });
      return { breached, checked: true };
    } catch (err) {
      log().warn({ err }, "breached-password check unavailable; allowing the password (fail-open)");
      return { breached: false, checked: false };
    }
  };
}

/** Passwords the test fake reports as breached. */
export const FAKE_BREACHED_PASSWORDS = ["password123456", "qwertyuiop123"] as const;

const fakeChecker: Checker = async (password) => ({
  breached: (FAKE_BREACHED_PASSWORDS as readonly string[]).includes(password),
  checked: true,
});

let real: Checker | undefined;

export function checkBreachedPassword(password: string): Promise<BreachResult> {
  if (env().APP_ENV === "test") return fakeChecker(password);
  real ??= createBreachChecker();
  return real(password);
}
