import { NextResponse } from "next/server";
import { z } from "zod";
import { parseShopId } from "@/lib/brand";
import { normaliseMemberId } from "@/lib/codes";
import { addDays, londonDate, londonWeekStart } from "@/lib/time";
import { getAuth } from "@/server/auth/auth";
import { beginStaffLogin } from "@/server/auth/staff-login";
import { authScope } from "@/server/authz/scope";
import { fakeAi } from "@/server/integrations/ai";
import { fakePushSink } from "@/server/integrations/push";
import { realtimeHub } from "@/server/realtime/process-hub";
import { deliverRealtime } from "@/server/realtime/publish";
import { deleteUserSessions } from "@/server/repos/sessions";
import { MEMBER_QR_LIFETIME_MS, memberQrKeys, signMemberQr } from "@/server/security/member-qr";
import {
  ACTOR_ROLES,
  ageUserSessions,
  userSessionIps,
  TEST_PASSWORD,
  fakeEmail,
  makeActor,
  makeAdmin,
  makeMembership,
  makeProgramme,
  makeOpsSnapshot,
  SAMPLE_PROGRAMME,
  makeShop,
  makeShopHours,
  makeStaff,
  makeUser,
  markSessionMfaVerified,
  expireOpenRequests,
  setShopStatus,
  userPointRequests,
} from "@/server/testing/factories";
import { relayShopRealtime } from "@/server/testing/realtime";
import { expireLiveRedeemCodes } from "@/server/testing/redemptions";
import { testApiAllowed } from "@/server/testing/test-api";
import { approvedVisit, currentMembership, storeStubReceiptPdfs } from "@/server/testing/visits";

/**
 * Test-only seeding API (APP_ENV=test). Lets E2E specs create exactly the data they need and sign in
 * as any role without driving the UI. Returns 404 in every other environment (proved by a test).
 */
const notFound = (): Response => new Response("Not found", { status: 404 });

const sessionInput = z
  .object({
    role: z.enum(ACTOR_ROLES),
    shopId: z.uuid().optional(),
    /** P0-12: staff/owner actors can also be staff of this many extra new shops (shop switcher). */
    extraShops: z.number().int().min(0).max(3).optional(),
    /** P1-04: false → a customer with no profile yet (the join sheet asks for it). */
    profile: z.boolean().optional(),
    /** P1-12: a staff actor's per-award limit in gold (default 200); above it an approval goes to the owner. */
    perAwardLimit: z.number().int().min(1).max(100_000).optional(),
  })
  .strict();

type TestCookie = {
  name: string;
  value: string;
  path: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  expires?: number;
};
type TestHelpers = {
  login(opts: { userId: string }): Promise<{ token: string; cookies: TestCookie[] }>;
};

/** A password user with no session: lets E2E drive real sign-in/enrolment flows through the UI. */
const userInput = z
  .object({
    label: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .default("e2e-user"),
    /** Enrol TOTP up front (through Better Auth's own endpoints) and return the secret. */
    totp: z.boolean().default(false),
    /**
     * Wrong-password attempts already made on the account, each from its own address (P0-19): reserved
     * through the real guard and never cleared, so `lockAfter` of them put the account in "needs a check".
     */
    failedSignIns: z.number().int().min(0).max(20).default(0),
    /** Also an admin (owner): admin session rules (2 h) instead of staff ones. */
    admin: z.boolean().default(false),
  })
  .strict();

/**
 * Turns on TOTP the way the UI does (enable with the password, then verify a code), then drops the setup
 * sessions so the browser starts signed out. Lets specs test the code challenge without re-running the
 * whole enrolment flow first.
 */
async function enrolTotp(userId: string): Promise<string> {
  const helpers = ((await getAuth().$context) as unknown as { test?: TestHelpers }).test;
  if (!helpers) throw new Error("test utilities unavailable");
  const { cookies } = await helpers.login({ userId });
  const headers = new Headers({ cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") });
  const enabled = await getAuth().api.enableTwoFactor({
    body: { password: TEST_PASSWORD },
    headers,
  });
  if (!("totpURI" in enabled)) throw new Error("TOTP enrolment did not return a URI");
  const { TOTP, URI } = await import("otpauth");
  const totp = URI.parse(enabled.totpURI);
  if (!(totp instanceof TOTP)) throw new Error("unexpected OTP type");
  await getAuth().api.verifyTOTP({ body: { code: totp.generate() }, headers });
  await deleteUserSessions(authScope("test API: drop TOTP setup sessions"), userId);
  return totp.secret.base32;
}

const fakesInput = z
  .object({
    ai: z
      .discriminatedUnion("mode", [
        z.object({ mode: z.literal("ok"), text: z.string().max(2000) }).strict(),
        z.object({ mode: z.enum(["error", "timeout", "empty"]) }).strict(),
      ])
      .optional(),
  })
  .strict();

/** Moves a user's sessions back in time (role limits, idle expiry) for the P0-19 conformance spec. */
const ageInput = z
  .object({
    userId: z.string().min(1).max(64),
    createdAgoMs: z
      .number()
      .int()
      .min(0)
      .max(400 * 24 * 3600 * 1000)
      .optional(),
    expiresInMs: z
      .number()
      .int()
      .min(-400 * 24 * 3600 * 1000)
      .max(400 * 24 * 3600 * 1000)
      .optional(),
  })
  .strict();

/** Never served by the app: the landing spec fulfils it from a fixture (`page.route`). */
const E2E_COVER_PATH = "/e2e-fixtures/shop-cover.jpg";

/** P1-02: a shop in a given state for the landing page specs, optionally with full details and a member. */
const shopInput = z
  .object({
    status: z.enum(["pending", "active", "expiring", "grace", "restricted", "suspended", "closed"]),
    name: z.string().min(1).max(80).optional(),
    /** Address, phone, location, description and a full week of hours. */
    details: z.boolean().default(false),
    /** P1-09: one special closure this many days from today (London), noted "Staff training". Needs details. */
    closureInDays: z.number().int().min(0).max(6).optional(),
    /** A cover at a same-origin path the spec serves with `page.route` (tests/e2e/fixtures/shop-cover.jpg). */
    cover: z.boolean().default(false),
    memberUserId: z.uuid().optional(),
    /** P1-07: the member's counters (Wallet sort order and progress). */
    member: z
      .object({
        purchaseCount: z.number().int().min(0).max(10_000).default(0),
        progressGold: z.number().int().min(0).max(100_000).default(0),
        ingotsCompleted: z.number().int().min(0).max(10_000).default(0),
        lastVisitDaysAgo: z.number().int().min(0).max(3650).optional(),
        /** P1-12: the highest tier reached (stored on the membership, never lowered). */
        tier: z.enum(["bronze", "silver", "gold"]).optional(),
        /** P1-12: a streak of this many weeks whose last week is this week (London). */
        streakWeeks: z.number().int().min(1).max(520).optional(),
        /** P1-C close (code review M2): gold owed from a reversal larger than the progress there was. */
        goldShortfall: z.number().int().min(0).max(100_000).optional(),
      })
      .strict()
      .optional(),
    /**
     * P1-12: this many approved visits after the membership is made, each a real request approved by the shop's
     * owner through the approvals service (ledger, counters, rewards, receipt). Needs a member and a programme.
     */
    visits: z.number().int().min(0).max(12).default(0),
    /** P1-15: leave the seeded visits unseen, so the customer's app celebrates the newest (default: seen). */
    celebrate: z.boolean().default(false),
    /**
     * P1-07: a loyalty programme (Café classic template, ingot 1,000 gold), version 1, owned by nobody real.
     * P1-08: "sample" = the DESIGN §15 sample rewards (milestones 25/50 and a mystery at 75).
     */
    programme: z.union([z.boolean(), z.literal("sample"), z.literal("per_pound")]).default(false),
    /** P2-02: the approve form's quick-picks (`shops.quick_picks`). */
    quickPicks: z
      .array(
        z
          .object({
            label: z.string().min(1).max(40),
            pricePence: z.number().int().min(1).max(10_000_000).nullable(),
          })
          .strict(),
      )
      .max(8)
      .optional(),
  })
  .strict();

/** P1-10: what the worker's publish job does, for E2E (the E2E server runs no worker). Ids only. */
const realtimePublishInput = z.object({ userId: z.uuid() }).strict();

/** P1-04: move a seeded shop to another state mid-flow (suspended while the join sheet is open). */
const shopStatusInput = z.object({ shopId: z.uuid(), status: shopInput.shape.status }).strict();

/** P1-11: a user's open request at a shop runs out (what the expiry job does; the E2E server has no worker). */
const expireRequestInput = z.object({ userId: z.uuid(), shopId: z.uuid() }).strict();
/** P1-11: a user's points requests (ids and statuses only). */
const pointRequestsInput = z.object({ userId: z.uuid() }).strict();

/** P2-02: an EXPIRED member-QR token for a member ID (the scanner's "expired" answer; a live one comes from /api/me/member-qr). */
const expiredMemberQrInput = z.object({ memberId: z.string().min(6).max(7) }).strict();

/** P1-16: a shop's live redeem codes moved past their 15 minutes. */
const expireRedeemCodesInput = z.object({ shopId: z.uuid() }).strict();

/** P1-12: what the worker's `pdf:receipt` jobs leave behind for a shop's receipts (stub files; no worker in E2E). */
const receiptPdfsInput = z.object({ shopId: z.uuid() }).strict();
/** P1-12: deliver the realtime hints a shop's actions queued (the worker's publish job; no worker in E2E). */
const relayRealtimeInput = z.object({ shopId: z.uuid() }).strict();
/**
 * P1-15: one approved visit for an existing member (the owner approves a real request through the service),
 * left unseen so the member's app celebrates it. Its realtime hints wait in the outbox for `relay-realtime`.
 */
const approveVisitInput = z
  .object({
    shopId: z.uuid(),
    userId: z.uuid(),
    amountPence: z.number().int().min(1).max(100_000).optional(),
    items: z.array(z.string().min(1).max(40)).max(10).optional(),
  })
  .strict();

type Ctx = { params: Promise<{ action: string }> };
const invalid = (): Response => NextResponse.json({ error: "invalid input" }, { status: 400 });

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  if (!testApiAllowed(req)) return notFound();
  const { action } = await ctx.params;
  const body: unknown = await req.json().catch(() => null);
  switch (action) {
    case "session":
      return createSession(body);
    case "realtime-publish": {
      const parsed = realtimePublishInput.safeParse(body);
      if (!parsed.success) return invalid();
      const receivers = await deliverRealtime({
        targets: [{ kind: "user", id: parsed.data.userId }],
        event: { type: "notification", data: {} },
      });
      return NextResponse.json({ receivers });
    }
    case "expire-request": {
      const parsed = expireRequestInput.safeParse(body);
      if (!parsed.success) return invalid();
      const { userId, shopId } = parsed.data;
      const ids = await expireOpenRequests(userId, shopId);
      // What the worker's publish job would do with the expiry's outbox row.
      for (const requestId of ids) {
        await deliverRealtime({
          targets: [{ kind: "user", id: userId }],
          event: { type: "request_decided", data: { requestId, shopId, outcome: "expired" } },
        });
      }
      return NextResponse.json({ expired: ids.length });
    }
    case "expire-redeem-codes": {
      const parsed = expireRedeemCodesInput.safeParse(body);
      if (!parsed.success) return invalid();
      return NextResponse.json({ expired: await expireLiveRedeemCodes(parsed.data.shopId) });
    }
    case "receipt-pdfs": {
      const parsed = receiptPdfsInput.safeParse(body);
      if (!parsed.success) return invalid();
      return NextResponse.json({ stored: await storeStubReceiptPdfs(parsed.data.shopId) });
    }
    case "relay-realtime": {
      const parsed = relayRealtimeInput.safeParse(body);
      if (!parsed.success) return invalid();
      return NextResponse.json({ delivered: await relayShopRealtime(parsed.data.shopId) });
    }
    case "approve-visit": {
      const parsed = approveVisitInput.safeParse(body);
      if (!parsed.success) return invalid();
      const { shopId, userId, amountPence, items } = parsed.data;
      const membership = await currentMembership(shopId, userId);
      if (!membership) return invalid();
      const approved = await approvedVisit(membership, {
        ...(amountPence === undefined ? {} : { amountPence }),
        ...(items === undefined ? {} : { items }),
      });
      return NextResponse.json({
        requestId: approved.requestId,
        receiptNumber: approved.receiptNumber,
        gold: approved.gold,
      });
    }
    case "expired-member-qr": {
      const parsed = expiredMemberQrInput.safeParse(body);
      const memberId = parsed.success ? normaliseMemberId(parsed.data.memberId) : null;
      if (!memberId) return invalid();
      const { token } = signMemberQr(
        memberId,
        Date.now() - MEMBER_QR_LIFETIME_MS - 60_000,
        memberQrKeys(),
      );
      return NextResponse.json({ token });
    }
    case "point-requests": {
      const parsed = pointRequestsInput.safeParse(body);
      if (!parsed.success) return invalid();
      return NextResponse.json({ requests: await userPointRequests(parsed.data.userId) });
    }
    case "user": {
      const parsed = userInput.safeParse(body ?? {});
      if (!parsed.success) return invalid();
      const user = await makeUser({
        email: fakeEmail(parsed.data.label),
        name: "Test Staff",
        password: TEST_PASSWORD,
      });
      if (parsed.data.admin) await makeAdmin(user.id, "owner");
      const totpSecret = parsed.data.totp ? await enrolTotp(user.id) : undefined;
      for (let i = 0; i < parsed.data.failedSignIns; i++) {
        // TEST-NET-2 addresses: distinct sources, so no single account + IP pair is locked.
        const seeded = await beginStaffLogin({
          email: user.email,
          ip: `198.51.100.${String(i + 1)}`,
        });
        if (!seeded.ok) throw new Error(`seeding failed sign-ins: ${seeded.code}`);
      }
      return NextResponse.json({
        userId: user.id,
        email: user.email,
        password: TEST_PASSWORD,
        ...(totpSecret ? { totpSecret } : {}),
      });
    }
    case "age-sessions": {
      const parsed = ageInput.safeParse(body);
      if (!parsed.success) return invalid();
      await ageUserSessions(parsed.data.userId, parsed.data);
      return NextResponse.json({ ok: true });
    }
    case "fakes": {
      const parsed = fakesInput.safeParse(body);
      if (!parsed.success) return invalid();
      if (parsed.data.ai) fakeAi.script(parsed.data.ai);
      return NextResponse.json({ ok: true });
    }
    case "shop": {
      const parsed = shopInput.safeParse(body);
      if (!parsed.success) return invalid();
      const {
        status,
        name,
        details,
        cover,
        memberUserId,
        member,
        programme,
        closureInDays,
        visits,
        celebrate,
        quickPicks,
      } = parsed.data;
      if (visits > 0 && (!memberUserId || !programme)) return invalid();
      const shop = await makeShop({
        status,
        ...(name ? { name } : {}),
        ...(cover ? { coverUrl: E2E_COVER_PATH } : {}),
        ...(quickPicks ? { quickPicks } : {}),
        ...(details
          ? {
              description: "Small-batch coffee, fresh bakes and a warm welcome on the high street.",
              addressLine1: "12 High Street",
              town: "Shoreditch",
              postcode: "E1 6AN",
              phone: "+442071234567",
              location: { lng: -0.0754, lat: 51.5245 },
            }
          : {}),
      });
      if (details) {
        await makeShopHours(
          shop.id,
          [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
            weekday,
            opens: weekday === 7 ? "10:00" : "07:30",
            closes: weekday >= 5 ? "23:00" : "18:00",
          })),
          closureInDays === undefined
            ? []
            : [{ date: addDays(londonDate(new Date()), closureInDays), note: "Staff training" }],
        );
      }
      if (programme) {
        await makeProgramme(
          shop.id,
          1_000,
          programme === "sample"
            ? SAMPLE_PROGRAMME
            : // P2-02: 2 gold per £1 spent (the live gold preview follows the amount).
              programme === "per_pound"
              ? { earnMode: "per_pound", earnRate: 2 }
              : {},
        );
      }
      if (memberUserId) {
        const { lastVisitDaysAgo, streakWeeks, ...counters } = member ?? {};
        const membership = await makeMembership(memberUserId, shop.id, {
          ...counters,
          ...(lastVisitDaysAgo === undefined
            ? {}
            : { lastVisitAt: new Date(Date.now() - lastVisitDaysAgo * 24 * 60 * 60 * 1000) }),
          ...(streakWeeks === undefined
            ? {}
            : { streakWeeks, streakLastWeekStart: londonWeekStart(new Date()) }),
        });
        for (let i = 0; i < visits; i += 1) await approvedVisit(membership, { seen: !celebrate });
      }
      return NextResponse.json({ shopId: shop.id, shopCode: shop.shopCode });
    }
    case "shop-status": {
      const parsed = shopStatusInput.safeParse(body);
      const shopId = parsed.success ? parseShopId(parsed.data.shopId) : null;
      if (!parsed.success || !shopId) return invalid();
      await setShopStatus(shopId, parsed.data.status);
      return NextResponse.json({ ok: true });
    }
    case "ops-snapshot": {
      // P0-13: a sample health snapshot for the System page (the E2E server runs no worker).
      const snapshot = await makeOpsSnapshot();
      return NextResponse.json({ takenAt: snapshot.takenAt });
    }
    case "reset-fakes":
      fakePushSink.reset();
      fakeAi.reset();
      return NextResponse.json({ ok: true });
    default:
      return notFound();
  }
}

/**
 * GET /api/test/push → payloads recorded by the fake push sink.
 * GET /api/test/runtime → how the running server was built (P0-14 production parity): NODE_ENV and
 * Better Auth's *resolved* limiter setting. A request burst can't prove the limiter is off locally
 * (TRUSTED_PROXY=none disables Better Auth's IP tracking, which also no-ops its limiter), so the E2E
 * spec reads the value the library actually resolved.
 */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  if (!testApiAllowed(req)) return notFound();
  const { action } = await ctx.params;
  switch (action) {
    case "push":
      return NextResponse.json(fakePushSink.list());
    case "realtime-stats":
      // P1-10: this server process's open streams (leak checks over real sockets).
      return NextResponse.json({
        ...realtimeHub().stats(),
        forUser: realtimeHub().streamsFor(new URL(req.url).searchParams.get("userId") ?? ""),
      });
    case "sessions": {
      // ?userId= → the client IPs recorded on that user's sessions (P0-19 conformance).
      const userId = new URL(req.url).searchParams.get("userId") ?? "";
      if (!userId || userId.length > 64) return invalid();
      return NextResponse.json({ ips: await userSessionIps(userId) });
    }
    case "runtime": {
      const context = (await getAuth().$context) as unknown as {
        rateLimit?: { enabled?: unknown };
      };
      return NextResponse.json({
        nodeEnv: process.env.NODE_ENV,
        betterAuthRateLimitEnabled: context.rateLimit?.enabled ?? null,
      });
    }
    default:
      return notFound();
  }
}

/**
 * Every other method is a plain 404 too, in every environment (A-QA-9): left unexported, Next would answer
 * 405 (and OPTIONS 204 with an Allow header), which reveals that the route exists. HEAD follows GET.
 */
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const OPTIONS = notFound;

async function createSession(body: unknown): Promise<Response> {
  const parsed = sessionInput.safeParse(body);
  if (!parsed.success) return invalid();

  const actor = await makeActor(parsed.data.role, {
    ...(parsed.data.shopId ? { shopId: parsed.data.shopId } : {}),
    ...(parsed.data.profile === false ? { profile: false } : {}),
    ...(parsed.data.perAwardLimit === undefined
      ? {}
      : { perAwardLimit: parsed.data.perAwardLimit }),
  });
  const extraShopIds: string[] = [];
  for (let i = 0; i < (parsed.data.extraShops ?? 0); i++) {
    const shop = await makeShop({ name: `Second Shop ${String(i + 1)}` });
    await makeStaff(shop.id, actor.user.id, "staff");
    extraShopIds.push(shop.id);
  }
  const helpers = ((await getAuth().$context) as unknown as { test?: TestHelpers }).test;
  if (!helpers) return NextResponse.json({ error: "test utilities unavailable" }, { status: 500 });

  const login = await helpers.login({ userId: actor.user.id });
  // Staff/admin sessions must be MFA-verified, exactly like a real TOTP sign-in.
  if (parsed.data.role !== "customer") await markSessionMfaVerified(login.token);

  const res = NextResponse.json({
    userId: actor.user.id,
    email: actor.user.email,
    shopId: actor.shopId,
    shopCode: actor.shopCode,
    role: parsed.data.role,
    extraShopIds,
  });
  for (const c of login.cookies) {
    res.cookies.set(c.name, c.value, {
      path: c.path,
      httpOnly: c.httpOnly ?? true,
      secure: c.secure ?? false,
      sameSite: (c.sameSite ?? "Lax").toLowerCase() as "lax" | "strict" | "none",
      // Better Auth's test cookie uses Playwright's convention: `expires` in seconds since the epoch.
      ...(c.expires ? { expires: new Date(c.expires * 1000) } : {}),
    });
  }
  return res;
}
