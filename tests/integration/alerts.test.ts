import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { sendStaffLockoutEmail } from "@/server/auth/lockout-email";
import { env } from "@/server/env";
import { openEnvelope } from "@/server/jobs/envelope";
import { getQueue } from "@/server/jobs/queues";
import { jobDef } from "@/server/jobs/registry";
import {
  type DeliveredAlert,
  alertRecipients,
  createAlerter,
  LOCAL_ALERT_EMAIL,
  deliverAlertEmail,
  enqueueAlert,
  LOCKOUT_EMAILS_PER_DAY,
} from "@/server/ops/alerts";
import { limiterRedis } from "@/server/security/rate-limit";
import { testEmail } from "../fixtures/auth";
import { makeAdmin, makeUser } from "../fixtures/factories";
import { countEmailsTo, latestEmailTo } from "../support/mailpit";

/**
 * P0-13 C-22 / C-31: security and ops alerts reach both developers, deduplicated per kind (one email per
 * 5-minute window, later events counted and reported once), even when Redis is down; the staff-lockout
 * email has a per-user daily cap.
 */
const dead = new Redis("redis://127.0.0.1:1", {
  lazyConnect: true,
  maxRetriesPerRequest: 0,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

afterAll(() => {
  dead.disconnect();
});

function capture(): { sent: DeliveredAlert[]; send: (a: DeliveredAlert) => Promise<void> } {
  const sent: DeliveredAlert[] = [];
  return {
    sent,
    send: async (a) => {
      sent.push(a);
    },
  };
}

describe("[P0-13] C-22: alerts are deduplicated per kind with a count", () => {
  it("first event sends, the next five in the window are counted, the flush reports them once", async () => {
    const box = capture();
    // A unique prefix per test keeps windows from other tests (same worker) apart.
    const alerter = createAlerter({
      redis: limiterRedis,
      send: box.send,
      windowMs: 300,
      keyPrefix: `t-${newId()}`,
    });
    expect(
      await alerter.raise({ kind: "auth.lockout", category: "security", detail: { n: 1 } }),
    ).toBe("sent");
    for (let i = 0; i < 5; i++) {
      expect(
        await alerter.raise({ kind: "auth.lockout", category: "security", detail: { n: i } }),
      ).toBe("suppressed");
    }
    // Another kind has its own window.
    expect(await alerter.raise({ kind: "outbox.stale", category: "ops", detail: {} })).toBe("sent");
    expect(box.sent.map((a) => [a.kind, a.suppressed])).toEqual([
      ["auth.lockout", 0],
      ["outbox.stale", 0],
    ]);
    expect(await alerter.flush()).toBe(0); // window still open: nothing to report yet
    await new Promise((r) => setTimeout(r, 400));
    expect(await alerter.flush()).toBe(1);
    expect(box.sent.at(-1)).toMatchObject({ kind: "auth.lockout", suppressed: 5, summary: true });
    expect(await alerter.flush()).toBe(0); // reported once
    // The next event opens a new window and sends at once.
    expect(await alerter.raise({ kind: "auth.lockout", category: "security", detail: {} })).toBe(
      "sent",
    );
  });

  it("a spray of 200 events sends one email (the inboxes and the email quota are safe)", async () => {
    const box = capture();
    const alerter = createAlerter({
      redis: limiterRedis,
      send: box.send,
      keyPrefix: `t-${newId()}`,
    });
    const results = await Promise.all(
      Array.from({ length: 200 }, () =>
        alerter.raise({ kind: "auth.lockout", category: "security", detail: {} }),
      ),
    );
    expect(results.filter((r) => r === "sent")).toHaveLength(1);
    expect(box.sent).toHaveLength(1);
  });

  it("Redis down: dedup falls back to this process's memory, so the alert still goes out once", async () => {
    const box = capture();
    const alerter = createAlerter({ redis: () => dead, send: box.send, windowMs: 300 });
    expect(await alerter.raise({ kind: "health.redis", category: "ops", detail: {} })).toBe("sent");
    expect(await alerter.raise({ kind: "health.redis", category: "ops", detail: {} })).toBe(
      "suppressed",
    );
    await new Promise((r) => setTimeout(r, 400));
    expect(await alerter.flush()).toBe(1);
    expect(box.sent.map((a) => a.suppressed)).toEqual([0, 1]);
  });

  it("a failed delivery is reported as failed and does not open the window (the next event retries)", async () => {
    let calls = 0;
    const alerter = createAlerter({
      redis: limiterRedis,
      keyPrefix: `t-${newId()}`,
      send: async () => {
        calls++;
        if (calls === 1) throw new Error("provider down");
      },
    });
    expect(await alerter.raise({ kind: "outbox.lost", category: "ops", detail: {} })).toBe(
      "failed",
    );
    expect(await alerter.raise({ kind: "outbox.lost", category: "ops", detail: {} })).toBe("sent");
  });
});

describe("[P0-13] C-22: delivery to both developers", () => {
  it("the alert email goes to every ALERT_EMAILS address, with ids and counts only (no PII)", async () => {
    const to = [testEmail("alert-dev-a"), testEmail("alert-dev-b")];
    await deliverAlertEmail(
      {
        kind: "auth.lockout",
        category: "security",
        suppressed: 3,
        summary: false,
        at: new Date("2026-11-10T12:00:00Z"),
        detail: { account: "a1b2c3", ipHash: "f00d", note: "contact jane@example.com" },
      },
      { to },
    );
    for (const address of to) {
      const mail = await latestEmailTo(address);
      expect(mail.subject).toBe("[Moz test] security alert: auth.lockout (+3 more)");
      expect(mail.text).toContain("a1b2c3");
      expect(mail.text).toContain("10 Nov 2026, 12:00");
      expect(mail.text).not.toContain("jane@example.com");
      expect(mail.text).toContain("/admin/system");
    }
  });

  it("the web path enqueues a system job email:ops-alert whose payload validates", async () => {
    const id = await enqueueAlert({
      kind: "auth.lockout",
      category: "security",
      suppressed: 0,
      summary: false,
      at: new Date(),
      detail: { account: "abc" },
    });
    const job = await getQueue("email").getJob(id);
    expect(job?.name).toBe("ops-alert");
    const def = jobDef("email", "ops-alert");
    expect(def?.runAs).toBe("system");
    if (!def) throw new Error("no def");
    expect(openEnvelope(def, job?.data)).toMatchObject({
      kind: "ok",
      data: { kind: "auth.lockout", category: "security", suppressed: 0 },
    });
    await job?.remove();
  });

  it("ALERT_EMAILS has a local default so local/test alerts land in Mailpit", () => {
    expect(env().ALERT_EMAILS).toEqual([]);
    expect(alertRecipients()).toEqual([LOCAL_ALERT_EMAIL]);
  });
});

describe("[P0-13] C-31: the staff-lockout email has a per-user daily cap", () => {
  it(`sends at most ${String(LOCKOUT_EMAILS_PER_DAY)} lockout emails per account per day`, async () => {
    const user = await makeUser({
      email: testEmail("lockout-cap"),
      password: "x-not-used-x-not-used",
    });
    await makeAdmin(user.id, "owner");
    for (let i = 0; i < LOCKOUT_EMAILS_PER_DAY + 2; i++) {
      await sendStaffLockoutEmail(user.id, "password");
    }
    await latestEmailTo(user.email);
    expect(await countEmailsTo(user.email)).toBe(LOCKOUT_EMAILS_PER_DAY);
  });
});
