import "server-only";
import { londonDay } from "@/lib/format-date";
import { BROWSER_SENTRY_DSN, scrubEvent } from "@/lib/sentry-scrub";
import { env } from "@/server/env";
import { isAppError } from "@/server/errors";
import { log } from "@/server/log";
import { countSentryEvent } from "@/server/ops/usage";
import { ipLimit, limit, limiterRedis } from "@/server/security/rate-limit";
import { assertSameOrigin, clientIp } from "@/server/security/request";

/**
 * `/api/monitoring` (P0-13): the browser SDK's tunnel. The browser posts its Sentry envelope here instead of to
 * sentry.io, so the CSP needs no third-party `connect-src`, ad blockers don't hide errors, and the server gets a
 * second look before anything leaves:
 *  - same origin only; at most 64 KB; 20 envelopes per IP per minute (Redis down → dropped, fail-closed);
 *  - the envelope must name the browser's placeholder DSN; it is forwarded to the project of the server's
 *    SENTRY_DSN only (never an open relay), and the real DSN never ships in the bundle;
 *  - one `event` item per envelope passes (no sessions, replays, attachments, profiles), scrubbed again (a stale
 *    bundle can't leak), sampled like the server's events, within the browser budget (takeBrowserBudget) and
 *    counted for the 70% quota alert only when Sentry accepted it;
 *  - the reply is always 204/4xx from us; the upstream status is never echoed.
 * Without SENTRY_DSN (local, tests) envelopes are accepted and dropped.
 */
export const TUNNEL_MAX_BYTES = 64 * 1024;
const TUNNEL_LIMIT = { max: 20, windowSec: 60 } as const;
const BROWSER_WINDOW_MS = 10 * 60_000;
const BROWSER_PER_WINDOW = 20;
const FORWARD_TIMEOUT_MS = 3_000;

/** Posts the envelope; true when Sentry accepted it (a 429 over quota is not counted as sent). */
type Forward = (url: string, body: string) => Promise<boolean>;

const defaultForward: Forward = async (url, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-sentry-envelope" },
    body,
    signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
  });
  await res.body?.cancel();
  return res.ok;
};

const noContent = (): Response => new Response(null, { status: 204 });
const refuse = (status: number): Response => new Response(null, { status });

async function readLimited(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > TUNNEL_MAX_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > TUNNEL_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The envelope's first `event` item, scrubbed and stamped server-side, as a new envelope for the real DSN.
 * One event per envelope (the browser SDK sends one); other item types (sessions, client reports, replays,
 * attachments) are dropped. Tags are rebuilt from an allowlist: nothing the browser chose survives.
 */
export function filterEnvelope(
  raw: string,
  realDsn = "",
): { body: string; events: number; dsn: unknown } | null {
  const lines = raw.split("\n");
  let header: { dsn?: unknown; sent_at?: unknown };
  try {
    header = JSON.parse(lines[0] ?? "") as { dsn?: unknown; sent_at?: unknown };
  } catch {
    return null;
  }
  const out = [
    JSON.stringify({
      dsn: realDsn,
      ...(typeof header.sent_at === "string" ? { sent_at: header.sent_at } : {}),
    }),
  ];
  for (let i = 1; i + 1 < lines.length; i += 2) {
    let itemHeader: { type?: unknown };
    let payload: unknown;
    try {
      itemHeader = JSON.parse(lines[i] ?? "") as { type?: unknown };
      payload = JSON.parse(lines[i + 1] ?? "");
    } catch {
      return null;
    }
    if (itemHeader.type !== "event" || typeof payload !== "object" || payload === null) continue;
    const e = env();
    const stamped = {
      ...scrubEvent(payload),
      environment: e.APP_ENV,
      ...(e.APP_RELEASE ? { release: e.APP_RELEASE } : {}),
      tags: { process: "browser" },
    };
    out.push(JSON.stringify({ type: "event" }), JSON.stringify(stamped));
    return { body: `${out.join("\n")}\n`, events: 1, dsn: header.dsn };
  }
  return { body: "", events: 0, dsn: header.dsn };
}

/** The DSN named in the envelope header, read before anything else is parsed or counted. */
function headerDsn(raw: string): unknown {
  const first = raw.slice(0, raw.indexOf("\n") === -1 ? raw.length : raw.indexOf("\n"));
  try {
    return (JSON.parse(first) as { dsn?: unknown }).dsn;
  } catch {
    return undefined;
  }
}

/**
 * Browser events' own budget (security review HIGH-1), shared by every web process in redis-queue and separate
 * from the server's per-process cap, so junk posted to this public endpoint can neither silence the server's
 * reporting nor eat the month's quota: ≤ 20 per 10 min and ≤ SENTRY_BROWSER_DAILY_CAP per UK day (≤ 1,800 a
 * month at the default 60). Redis down = dropped.
 */
async function takeBrowserBudget(now = new Date()): Promise<boolean> {
  const prefix = `${env().REDIS_KEY_PREFIX}usage:sentry-browser`;
  const tenMin = Math.floor(now.getTime() / BROWSER_WINDOW_MS);
  const day = londonDay(now);
  try {
    const [[, inWindow], , [, inDay]] = (await limiterRedis()
      .multi()
      .incr(`${prefix}:w:${String(tenMin)}`)
      .pexpire(`${prefix}:w:${String(tenMin)}`, BROWSER_WINDOW_MS * 2)
      .incr(`${prefix}:d:${day}`)
      .expire(`${prefix}:d:${day}`, 2 * 24 * 60 * 60)
      .exec()) as [[unknown, number], unknown, [unknown, number], unknown];
    return inWindow <= BROWSER_PER_WINDOW && inDay <= env().SENTRY_BROWSER_DAILY_CAP;
  } catch {
    return false;
  }
}

/** sentry.io envelope endpoint for a DSN: `https://<key>@<host>/<project>` → `https://<host>/api/<project>/envelope/`. */
export function envelopeUrl(dsn: string): string {
  const u = new URL(dsn);
  const project = u.pathname.replace(/^\/+/, "");
  return `${u.protocol}//${u.host}/api/${project}/envelope/`;
}

export async function tunnelResponse(
  request: Request,
  deps: { dsn?: string | undefined; forward?: Forward; budget?: () => Promise<boolean> } = {},
): Promise<Response> {
  try {
    assertSameOrigin(request);
  } catch (err) {
    if (isAppError(err)) return refuse(403);
    throw err;
  }
  const policy = ipLimit("sentry-tunnel", clientIp(request.headers), TUNNEL_LIMIT);
  if (policy) {
    const verdict = await limit({ ...policy, onError: "closed" });
    if (!verdict.ok) return refuse(429);
  }
  const raw = await readLimited(request);
  if (raw === null) return refuse(413);
  // The placeholder DSN first: nothing else is parsed, counted or budgeted for an envelope that isn't ours.
  if (headerDsn(raw) !== BROWSER_SENTRY_DSN) return refuse(400);
  const dsn = "dsn" in deps ? deps.dsn : env().SENTRY_DSN;
  if (!dsn) return noContent();
  const filtered = filterEnvelope(raw, dsn);
  if (!filtered) return refuse(400);
  if (filtered.events === 0) return noContent();
  if (Math.random() >= env().SENTRY_ERROR_SAMPLE_RATE) return noContent();
  if (!(await (deps.budget ?? takeBrowserBudget)())) return noContent();
  try {
    const accepted = await (deps.forward ?? defaultForward)(envelopeUrl(dsn), filtered.body);
    if (accepted) countSentryEvent();
  } catch (err) {
    log().warn({ err }, "sentry tunnel: forward failed (event dropped)");
  }
  return noContent();
}
