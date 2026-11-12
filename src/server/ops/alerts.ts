import "server-only";
import { formatDateTime, londonDay } from "@/lib/format-date";
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
/**
 * Alert deliveries per UK day and pool (health/quota alerts, and everything else), each to every ALERT_EMAILS
 * address: with two developers ≤ 2 × 2 × (12 + 1) = 52 emails, ~13% of the ≈ 400/day email cap, so alerts can
 * never starve sign-in links (security review HIGH-2). Past a pool's ceiling, one `alert.ceiling` notice, then log
 * and System page only until midnight.
 */
export const ALERT_DAILY_CEILING = 12;
/** Deliveries of one kind per UK day (security re-review: one noisy kind can't use up its pool). */
export const ALERT_PER_KIND_CEILING = 4;
/** C-31: lockout emails per account per day (SECURITY §12); the security alert itself is never capped. */
export const LOCKOUT_EMAILS_PER_DAY = 3;
/** …and across all accounts (a spray over many staff accounts can't eat the email quota either). */
export const LOCKOUT_EMAILS_PER_DAY_TOTAL = 30;
export const LOCAL_ALERT_EMAIL = "ops-alerts@moz.localhost";

/**
 * Opens the window (first event → 1 + the count left over from an unflushed window) or counts the event. A kind
 * that keeps firing gets longer windows: the 1st window in a streak is 1× the base, the 2nd 6×, then 12×
 * (5 → 30 → 60 min); the streak resets after 24 base windows (2 h) without a new window.
 */
const RAISE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('INCR', KEYS[2])
  redis.call('PEXPIRE', KEYS[2], 86400000)
  return {0, 0}
end
local streak = redis.call('INCR', KEYS[3])
local base = tonumber(ARGV[1])
local factor = 12
if streak == 1 then factor = 1 elseif streak == 2 then factor = 6 end
redis.call('SET', KEYS[1], '1', 'PX', base * factor)
redis.call('PEXPIRE', KEYS[3], base * (24 + factor))
local n = redis.call('GETDEL', KEYS[2])
return {1, tonumber(n or '0')}`;
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
  dailyCeiling?: number;
  perKindCeiling?: number;
  /** Key namespace below REDIS_KEY_PREFIX (tests isolate themselves with it). */
  keyPrefix?: string;
  now?: () => number;
}): Alerter {
  const windowMs = deps.windowMs ?? ALERT_WINDOW_MS;
  const now = deps.now ?? Date.now;
  const ns = `${env().REDIS_KEY_PREFIX}alert:${deps.keyPrefix ?? "v1"}`;
  const ceiling = deps.dailyCeiling ?? ALERT_DAILY_CEILING;
  const keys = (kind: string): [string, string, string] => [
    `${ns}:open:${kind}`,
    `${ns}:held:${kind}`,
    `${ns}:streak:${kind}`,
  ];
  const perKind = deps.perKindCeiling ?? ALERT_PER_KIND_CEILING;
  const memorySent = new Map<string, number>();

  /** Health/quota alerts have their own pool, so a noisy security or error kind can't silence them. */
  const poolOf = (kind: AlertKind): "health" | "other" =>
    kind.startsWith("health.") || kind.startsWith("quota.") ? "health" : "other";

  /** Increments today's counters for the kind and its pool (Redis, or this process's memory if it is down). */
  async function bump(kind: AlertKind, by: 1 | -1): Promise<{ kind: number; pool: number }> {
    const day = londonDay(new Date(now()));
    const kindKey = `${ns}:sent:kind:${kind}:${day}`;
    const poolKey = `${ns}:sent:${poolOf(kind)}:${day}`;
    try {
      const ttl = 2 * 24 * 60 * 60;
      const [[, k], , [, p]] = (await deps
        .redis()
        .multi()
        .incrby(kindKey, by)
        .expire(kindKey, ttl)
        .incrby(poolKey, by)
        .expire(poolKey, ttl)
        .exec()) as [[unknown, number], unknown, [unknown, number], unknown];
      return { kind: k, pool: p };
    } catch {
      const k = (memorySent.get(kindKey) ?? 0) + by;
      const p = (memorySent.get(poolKey) ?? 0) + by;
      memorySent.set(kindKey, k);
      memorySent.set(poolKey, p);
      return { kind: k, pool: p };
    }
  }

  /**
   * Delivers within the per-kind cap and its pool's daily ceiling; the first alert past the pool ceiling becomes
   * that pool's single `alert.ceiling` notice. A failed send gives its budget back.
   */
  async function deliverBudgeted(alert: DeliveredAlert): Promise<boolean | "over"> {
    const used = await bump(alert.kind, 1);
    const overKind = used.kind > perKind && alert.kind !== "alert.ceiling";
    if (!overKind && used.pool <= ceiling) {
      const ok = await deliver(alert);
      if (!ok) await bump(alert.kind, -1);
      return ok;
    }
    if (!overKind && used.pool === ceiling + 1) {
      await deliver({
        kind: "alert.ceiling",
        category: "ops",
        detail: { ceiling, pool: poolOf(alert.kind), firstHeldBack: alert.kind },
        suppressed: 0,
        summary: false,
        at: alert.at,
      });
    }
    if (overKind) await bump(alert.kind, -1).catch(() => undefined); // the pool keeps room for other kinds
    log().warn(
      { alert: alert.kind, suppressed: alert.suppressed, overKind },
      "alert over the daily ceiling: log only",
    );
    return "over";
  }
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
        const [k1, k2, k3] = keys(alert.kind);
        const reply = (await deps.redis().eval(RAISE_SCRIPT, 3, k1, k2, k3, String(windowMs))) as [
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
      const ok = await deliverBudgeted({
        ...alert,
        suppressed: held,
        summary: false,
        at: new Date(now()),
      });
      if (ok === "over") return "suppressed";
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
        const category: AlertCategory = kind.startsWith("auth.") ? "security" : "ops";
        const ok = await deliverBudgeted({
          kind,
          category,
          detail: {},
          suppressed: held,
          summary: true,
          at: new Date(t),
        });
        if (ok === true) reported++;
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
    const redis = limiterRedis();
    const bump = async (key: string): Promise<number> => {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, 2 * 24 * 60 * 60);
      return n;
    };
    const prefix = `${env().REDIS_KEY_PREFIX}alert:lockout-mail`;
    if ((await bump(`${prefix}:${userId}:${day}`)) > LOCKOUT_EMAILS_PER_DAY) return false;
    return (await bump(`${prefix}:all:${day}`)) <= LOCKOUT_EMAILS_PER_DAY_TOTAL;
  } catch (err) {
    log().warn({ err }, "lockout email cap unavailable; sending (fail-open)");
    return true;
  }
}
