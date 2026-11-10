import "server-only";
import { TURNSTILE_BYPASS_TOKEN } from "@/lib/turnstile";
import { env } from "@/server/env";
import { log } from "@/server/log";

export { TURNSTILE_BYPASS_TOKEN };

/**
 * Cloudflare Turnstile server check (P0-05, SECURITY §6). Fails closed: a missing/oversized token, a
 * Cloudflare error, a timeout or a token issued for another hostname is a rejection. The bypass token works
 * only in local/test with no secret configured. Cloudflare's public always-pass test secrets are refused
 * outside local/test, so a copied example key can't silently disable the check.
 */
export type TurnstileResult = { ok: true } | { ok: false; reason: string };
type Verify = (token: string | null | undefined, ip: string) => Promise<TurnstileResult>;

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5_000;
const MAX_TOKEN = 2048;
/** Cloudflare's documented test secrets (always pass / always fail / token already spent). */
const PUBLIC_TEST_SECRET = /^[123]x0+AA$/;

export function createTurnstileVerifier(opts: {
  secret: string | undefined;
  appEnv: "local" | "test" | "staging" | "production";
  expectedHostname: string;
  fetch?: typeof fetch;
}): Verify {
  const doFetch = opts.fetch ?? fetch;
  const isLocal = opts.appEnv === "local" || opts.appEnv === "test";
  const usable = Boolean(opts.secret) && (isLocal || !PUBLIC_TEST_SECRET.test(opts.secret ?? ""));

  return async (token, ip) => {
    if (!opts.secret && isLocal) {
      return token === TURNSTILE_BYPASS_TOKEN ? { ok: true } : { ok: false, reason: "missing" };
    }
    if (!usable) return { ok: false, reason: "not-configured" };
    if (!token) return { ok: false, reason: "missing" };
    if (token.length > MAX_TOKEN) return { ok: false, reason: "too-long" };

    const body = new URLSearchParams({ secret: opts.secret ?? "", response: token });
    if (ip !== "local" && ip !== "unknown") body.set("remoteip", ip);
    try {
      const res = await doFetch(SITEVERIFY, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return { ok: false, reason: `http-${String(res.status)}` };
      const data = (await res.json()) as {
        success?: boolean;
        hostname?: string;
        "error-codes"?: string[];
      };
      if (!data.success) return { ok: false, reason: data["error-codes"]?.[0] ?? "failed" };
      if (data.hostname !== opts.expectedHostname) return { ok: false, reason: "hostname" };
      return { ok: true };
    } catch (err) {
      log().warn({ err }, "turnstile verification unavailable");
      return { ok: false, reason: "unavailable" };
    }
  };
}

let shared: Verify | undefined;

/** Verify a widget token for this app (secret and hostname from the environment). */
export function verifyTurnstile(
  token: string | null | undefined,
  ip: string,
): Promise<TurnstileResult> {
  const e = env();
  shared ??= createTurnstileVerifier({
    secret: e.TURNSTILE_SECRET_KEY,
    appEnv: e.APP_ENV,
    expectedHostname: new URL(e.APP_URL).hostname,
  });
  return shared(token, ip);
}

/** Cloudflare itself failed (timeout, network, 5xx), as opposed to a missing or rejected token. */
export const isTurnstileOutage = (reason: string): boolean =>
  reason === "unavailable" || reason.startsWith("http-5");
