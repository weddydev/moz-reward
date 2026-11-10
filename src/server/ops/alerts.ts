import "server-only";
import { formatDateTime } from "@/lib/format-date";
import { env } from "@/server/env";
import { sendEmail } from "@/server/integrations/email";
import { sealEnvelope } from "@/server/jobs/envelope";
import { getQueue } from "@/server/jobs/queues";
import { redactText } from "@/server/jobs/redact";
import { jobDef } from "@/server/jobs/registry";
import { log } from "@/server/log";
import { limiterRedis } from "@/server/security/rate-limit";
import { ALERT_KINDS, type AlertKind } from "./alert-kinds";
import type { Redis } from "ioredis";

/**
 * Alerts to both developers (P0-13, C-22; SECURITY §12, ARCHITECTURE §11). Every security/ops alert is a log
 * line first (alert.ts), then goes through here:
 *  - **Deduplicated per kind**: the first event of a kind in a 5-minute window is delivered at once; later
 *    events in the window are only counted, and the health monitor's minute tick (`flush`) reports the count
 *    once the window closes. A spray of unknown emails therefore sends one email, not thousands, and never
 *    eats the email quota.
 *  - The window lives in redis-queue (shared by every process, never evicted). If Redis is down, this
 *    process's memory takes over, so "Redis is down" itself still reaches the developers.
 *  - **Delivery**: the worker sends the email directly (critical mail, ARCHITECTURE §10: never dropped or
 *    delayed); a web process enqueues `email:ops-alert` (the worker sends it). Enqueue is deliberate here, not
 *    the outbox: an alert belongs to no transaction and must not need the database (DECISIONS P0-13).
 * Details carry ids, hashes and counts only (callers' contract); free text is scrubbed again before sending.
 */
export { ALERT_KINDS, type AlertKind } from "./alert-kinds";
export type AlertCategory = "security" | "ops";

export type Alert = { kind: AlertKind; category: AlertCategory; detail: Record<string, unknown> };
/** What is delivered: the alert plus how many events of its kind were held back since the last email. */
export type DeliveredAlert = Alert & { suppressed: number; summary: boolean; at: Date };
export type RaiseResult = "sent" | "suppressed" | "failed";

export const ALERT_WINDOW_MS = 5 * 60 * 1000;
/** C-31: lockout emails per account per day (SECURITY §12); the security alert itself is never capped. */
export const LOCKOUT_EMAILS_PER_DAY = 3;
export const LOCAL_ALERT_EMAIL = "ops-alerts@moz.localhost";

/** Opens the window (first event → 1 + the count left over from an unflushed window) or counts the event. */
const RAISE_SCRIPT = `
if redis.call('SET', KEYS[1], '1', 'NX', 'PX', ARGV[1]) then
  local n = redis.call('GETDEL', KEYS[2])
  return {1, tonumber(n or '0')}
end
redis.call('INCR', KEYS[2])
redis.call('PEXPIRE', KEYS[2], 86400000)
return {0, 0}`;
/** After the window closed: the held-back count (and clear it), or 0. */
const FLUSH_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
return tonumber(redis.call('GETDEL', KEYS[2]) or '0')`;

type Sender = (alert: DeliveredAlert) => Promise<void>;

export type Alerter = { raise(alert: Alert): Promise<RaiseResult>; flush(): Promise<number> };

export function createAlerter(deps: {
  redis: () => Redis;
  send: Sender;
  windowMs?: number;
  /** Key namespace below REDIS_KEY_PREFIX (tests isolate themselves with it). */
  keyPrefix?: string;
  now?: () => number;
}): Alerter {
  const windowMs = deps.windowMs ?? ALERT_WINDOW_MS;
  const now = deps.now ?? Date.now;
  const ns = `${env().REDIS_KEY_PREFIX}alert:${deps.keyPrefix ?? "v1"}`;
  const keys = (kind: string): [string, string] => [`${ns}:open:${kind}`, `${ns}:held:${kind}`];
  // Fallback when Redis is unreachable: this process's own windows.
  const memory = new Map<string, { until: number; held: number; category: AlertCategory }>();

  async function deliver(alert: DeliveredAlert): Promise<boolean> {
    try {
      await deps.send(alert);
      return true;
    } catch (err) {
      log().error({ err, alert: alert.kind }, "alert delivery failed");
      return false;
    }
  }

  function openInMemory(alert: Alert): { open: boolean; held: number } {
    const t = now();
    const slot = memory.get(alert.kind);
    if (slot && slot.until > t) {
      slot.held++;
      return { open: false, held: 0 };
    }
    const held = slot?.held ?? 0;
    memory.set(alert.kind, { until: t + windowMs, held: 0, category: alert.category });
    return { open: true, held };
  }

  return {
    async raise(alert) {
      let open: boolean;
      let held: number;
      let viaRedis = true;
      try {
        const [k1, k2] = keys(alert.kind);
        const reply = (await deps.redis().eval(RAISE_SCRIPT, 2, k1, k2, String(windowMs))) as [
          number,
          number,
        ];
        open = reply[0] === 1;
        held = reply[1];
      } catch (err) {
        viaRedis = false;
        log().warn({ err, alert: alert.kind }, "alert dedup unavailable; using process memory");
        ({ open, held } = openInMemory(alert));
      }
      if (!open) return "suppressed";
      const ok = await deliver({ ...alert, suppressed: held, summary: false, at: new Date(now()) });
      if (ok) return "sent";
      // Not delivered: close the window again so the next event retries (the held count is kept).
      if (viaRedis) {
        const [k1, k2] = keys(alert.kind);
        await deps
          .redis()
          .multi()
          .del(k1)
          .incrby(k2, held)
          .exec()
          .catch(() => undefined);
      } else {
        memory.delete(alert.kind);
        if (held > 0) memory.set(alert.kind, { until: 0, held, category: alert.category });
      }
      return "failed";
    },

    async flush() {
      let reported = 0;
      const t = now();
      for (const kind of ALERT_KINDS) {
        let held = 0;
        try {
          const [k1, k2] = keys(kind);
          held = Number(await deps.redis().eval(FLUSH_SCRIPT, 2, k1, k2));
        } catch {
          // Redis down: only this process's windows can be flushed.
        }
        const slot = memory.get(kind);
        if (slot && slot.until <= t && slot.held > 0) {
          held += slot.held;
          slot.held = 0;
        }
        if (held <= 0) continue;
        const category: AlertCategory = kind === "auth.lockout" ? "security" : "ops";
        const ok = await deliver({
          kind,
          category,
          detail: {},
          suppressed: held,
          summary: true,
          at: new Date(t),
        });
        if (ok) reported++;
      }
      return reported;
    },
  };
}

/** Both developers (ALERT_EMAILS); local/test fall back to one Mailpit address. */
export function alertRecipients(): string[] {
  const e = env();
  if (e.ALERT_EMAILS.length > 0) return e.ALERT_EMAILS;
  return e.APP_ENV === "local" || e.APP_ENV === "test" ? [LOCAL_ALERT_EMAIL] : [];
}

const SENSITIVE_DETAIL_KEY = /(email|phone|token|code|password|secret|cookie|authorization|name)/i;

/** Ids, hashes and counts pass; personal-looking keys are dropped and free text is scrubbed (SECURITY §7). */
function scrubDetail(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrubDetail(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_DETAIL_KEY.test(k) ? "[redacted]" : scrubDetail(v, depth + 1);
  }
  return out;
}

function renderAlert(alert: DeliveredAlert): { subject: string; text: string } {
  const e = env();
  const more = alert.suppressed > 0 ? ` (+${String(alert.suppressed)} more)` : "";
  const subject = `[Moz ${e.APP_ENV}] ${alert.category} alert: ${alert.kind}${more}`;
  const lines = alert.summary
    ? [
        `${String(alert.suppressed)} more "${alert.kind}" events happened in the 5 minutes after the last alert email.`,
      ]
    : [
        `Alert: ${alert.kind} (${alert.category})`,
        `Time: ${formatDateTime(alert.at)} UK time`,
        ...(alert.suppressed > 0
          ? [
              `Also ${String(alert.suppressed)} earlier events of this kind that were held back by deduplication.`,
            ]
          : []),
        "",
        "Detail (ids, hashes and counts only):",
        JSON.stringify(scrubDetail(alert.detail), null, 2),
      ];
  return {
    subject,
    text: [
      ...lines,
      "",
      `System page: ${e.APP_URL}/admin/system`,
      `What to do: docs/RUNBOOK.md (search for "${alert.kind}")`,
      "",
      "One email per alert kind per 5 minutes; later events are counted and reported in one follow-up.",
    ].join("\n"),
  };
}

/** Sends the alert email to every developer. Critical mail: no budget or drop order applies (ARCH §10). */
export async function deliverAlertEmail(
  alert: DeliveredAlert,
  opts: { to?: readonly string[] } = {},
): Promise<void> {
  const to = opts.to ?? alertRecipients();
  if (to.length === 0) {
    log().error({ alert: alert.kind }, "no ALERT_EMAILS configured: alert only in the log");
    return;
  }
  const { subject, text } = renderAlert(alert);
  const results = await Promise.allSettled(
    to.map((address) => sendEmail({ kind: "ops-alert", to: address, subject, text })),
  );
  // One developer reached is a delivered alert; none reached is a failure (the next event retries).
  if (results.every((r) => r.status === "rejected")) {
    throw new Error(`ops alert ${alert.kind}: no recipient could be reached`);
  }
}

/** The web's sender: the worker delivers it (`email:ops-alert`). Returns the job id. */
export async function enqueueAlert(alert: DeliveredAlert): Promise<string> {
  const def = jobDef("email", "ops-alert");
  if (!def) throw new Error("email:ops-alert is not registered");
  const payload = {
    kind: alert.kind,
    category: alert.category,
    suppressed: alert.suppressed,
    summary: alert.summary,
    at: alert.at.toISOString(),
    detail: scrubDetail(alert.detail),
  };
  const job = await getQueue("email").add("ops-alert", sealEnvelope(def, payload));
  if (!job.id) throw new Error("BullMQ returned no id for email:ops-alert");
  return job.id;
}

type AlertState = { alerter?: Alerter | undefined; direct: boolean };
const state = ((globalThis as { __mozAlerts?: AlertState }).__mozAlerts ??= { direct: false });

/** The worker sends alerts itself (no queue round trip; works while Redis is down). Call once at start. */
export function enableDirectAlertDelivery(): void {
  state.direct = true;
  state.alerter = undefined;
}

function alerter(): Alerter {
  state.alerter ??= createAlerter({
    redis: limiterRedis,
    send: state.direct
      ? deliverAlertEmail
      : async (a) => {
          await enqueueAlert(a);
        },
  });
  return state.alerter;
}

/** Fire-and-forget delivery for alert.ts: never throws, never blocks the caller's request. */
export function raiseAlert(alert: Alert): void {
  void alerter()
    .raise(alert)
    .catch((err: unknown) => {
      log().error({ err, alert: alert.kind }, "alert not delivered");
    });
}

/** The process's shared alerter (the health monitor awaits it; request code uses `raiseAlert`). */
export function sharedAlerter(): Alerter {
  return alerter();
}

/** C-31: whether one more lockout email may go to this account today (fails open: security mail). */
export async function lockoutEmailAllowed(userId: string, day: string): Promise<boolean> {
  try {
    const key = `${env().REDIS_KEY_PREFIX}alert:lockout-mail:${userId}:${day}`;
    const redis = limiterRedis();
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 2 * 24 * 60 * 60);
    return n <= LOCKOUT_EMAILS_PER_DAY;
  } catch (err) {
    log().warn({ err }, "lockout email cap unavailable; sending (fail-open)");
    return true;
  }
}
