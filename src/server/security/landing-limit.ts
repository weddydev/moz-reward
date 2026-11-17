import "server-only";
import { ipLimit, type LimitResult, limit, type Limiter } from "@/server/security/rate-limit";
import { clientIp, type TrustedProxy } from "@/server/security/request";

/** Per-IP limit on `/s/[code]` lookups (closes C-15): 60 per minute, fails open (a public read). */
export const LANDING_LIMIT = { max: 60, windowSec: 60 } as const;

/**
 * Checks the per-IP shop-lookup limit for a request. Keyed on the trusted client IP (`clientIp`: the address
 * our proxy saw, never a client-supplied header). Returns null where no per-IP limit applies (local/test
 * without a trusted proxy). Our limit is the real control; a Cloudflare free-plan rule on `/s/*` is only the
 * backstop (RUNBOOK).
 */
export async function checkLandingLimit(
  headers: Headers,
  opts: { trusted?: TrustedProxy; limiter?: Limiter; now?: number } = {},
): Promise<LimitResult | null> {
  const spec = ipLimit("shop-lookup", clientIp(headers, opts.trusted), LANDING_LIMIT);
  if (!spec) return null;
  return (opts.limiter ?? limit)({
    ...spec,
    onError: "open",
    ...(opts.now === undefined ? {} : { now: opts.now }),
  });
}
