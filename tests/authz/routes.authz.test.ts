import { describe, expect, it, vi } from "vitest";
import { PORTAL_ROUTES, type PortalRoute } from "@/features/portal/routes";
import { defaultPortalPath } from "@/features/portal/routes";
import {
  ADMIN_SESSION_MAX_MS,
  type Principal,
  STAFF_SESSION_MAX_MS,
} from "@/server/authz/policies";
import { loadPrincipal } from "@/server/authz/principal";
import type * as EnvModule from "@/server/env";
import { gateAdminRoute, gateCustomerRoute, gateShopRoute } from "@/server/portal/gate";
import { parseAdminAllowlist } from "@/server/security/admin-allowlist";
import { type World, world } from "./harness";
import { makeAdmin, makeUser } from "../fixtures/factories";

/**
 * Route authz matrix (P0-12, C-01, C-24): every route in the table (`src/features/portal/routes.ts`) × every
 * principal column, through the real page gate (the same call the pages make). The catch-all pages call their
 * portal root's gate, so the root's row covers them. `src/features/portal/pages.test.ts` keeps the pages on
 * disk and the table in step, and the authz-coverage lint makes every portal page call its gate with a table
 * path: together, no page without a matrix row.
 *
 * Expectations are written from the spec (PRODUCT §2 + the P0-12 role matrix), not from the gate's code:
 * signed out → sign in (never 403); no membership → 403; then the role: a route the role may never open is
 * 403 whatever the session's state (a stale staff session on an owner-only page too), and only for a role
 * that may open it: MFA missing → /staff/security, past the 12 h / 2 h limit → sign in again; admin outside
 * ADMIN_IP_ALLOWLIST → 403 (DECISIONS 13 Nov 2026).
 */
const allowlist = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("@/server/env", async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return {
    ...actual,
    env: () => {
      const parsed = parseAdminAllowlist(allowlist.value);
      if (!parsed.ok) throw new Error(parsed.error);
      return { ...actual.env(), ADMIN_IP_ALLOWLIST: parsed.list };
    },
  };
});
// `forbidden()` needs the authInterrupts flag the Next build sets (next.config.ts).
process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = "true";

type Outcome =
  { kind: "allow"; shopId?: string } | { kind: "redirect"; to: string } | { kind: "forbidden" };

async function outcome(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    const value = await run();
    const shopId =
      value && typeof value === "object" && "shopId" in value ? String(value.shopId) : undefined;
    return shopId ? { kind: "allow", shopId } : { kind: "allow" };
  } catch (err) {
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;")) {
      return { kind: "redirect", to: digest.split(";").slice(2, -2).join(";") };
    }
    if (digest === "NEXT_HTTP_ERROR_FALLBACK;403") return { kind: "forbidden" };
    throw err;
  }
}

const hoursAgo = (ms: number): Date => new Date(Date.now() - ms - 60_000);

type Column = {
  name: string;
  principal: (w: World) => Principal | null | Promise<Principal | null>;
  shopCookie?: (w: World) => string;
  /** ADMIN_IP_ALLOWLIST for this column. */
  list?: string;
};

const p = (w: World, role: keyof World["principals"]): Principal => {
  const found = w.principals[role];
  if (!found) throw new Error(`world has no ${role}`);
  return found;
};

/** A deactivated admin (edge case): the principal carries no admin role, so they are a customer only. */
let inactiveAdmin: Promise<Principal | null> | undefined;
const deactivatedAdmin = (): Promise<Principal | null> =>
  (inactiveAdmin ??= (async () => {
    const user = await makeUser();
    await makeAdmin(user.id, "owner", { active: false });
    return loadPrincipal({ userId: user.id, mfaVerified: true, sessionCreatedAt: new Date() });
  })());

const COLUMNS: Column[] = [
  { name: "signed out", principal: () => null },
  { name: "customer", principal: (w) => p(w, "customer") },
  { name: "staff", principal: (w) => p(w, "staff_own_shop") },
  { name: "owner", principal: (w) => p(w, "owner_own_shop") },
  { name: "owner, no MFA", principal: (w) => p(w, "owner_own_shop_no_mfa") },
  {
    name: "staff, stale (12 h)",
    principal: (w) => ({
      ...p(w, "staff_own_shop"),
      sessionCreatedAt: hoursAgo(STAFF_SESSION_MAX_MS),
    }),
  },
  {
    name: "owner, stale (12 h)",
    principal: (w) => ({
      ...p(w, "owner_own_shop"),
      sessionCreatedAt: hoursAgo(STAFF_SESSION_MAX_MS),
    }),
  },
  {
    name: "staff, removed from the shop",
    principal: (w) => p(w, "staff_own_shop_inactive"),
    shopCookie: (w) => w.shopA.id,
  },
  {
    name: "staff of B, cookie names A",
    principal: (w) => p(w, "staff_other_shop"),
    shopCookie: (w) => w.shopA.id,
  },
  { name: "admin owner", principal: (w) => p(w, "admin_owner") },
  { name: "admin support", principal: (w) => p(w, "admin_support") },
  { name: "admin moderator", principal: (w) => p(w, "admin_moderator") },
  { name: "admin finance", principal: (w) => p(w, "admin_finance") },
  { name: "admin owner, no MFA", principal: (w) => p(w, "admin_owner_no_mfa") },
  {
    name: "admin owner, stale (2 h)",
    principal: (w) => ({
      ...p(w, "admin_owner"),
      sessionCreatedAt: hoursAgo(ADMIN_SESSION_MAX_MS),
    }),
  },
  { name: "admin owner, deactivated", principal: () => deactivatedAdmin() },
  {
    name: "admin owner, off-list",
    principal: (w) => ({ ...p(w, "admin_owner"), clientIp: "198.51.100.7" }),
    list: "203.0.113.0/24",
  },
  {
    name: "admin owner, on-list (IPv4-mapped)",
    principal: (w) => ({ ...p(w, "admin_owner"), clientIp: "::ffff:203.0.113.9" }),
    list: "203.0.113.0/24",
  },
];

const SHOP_ROLE: Partial<Record<string, "staff" | "owner">> = {
  staff: "staff",
  owner: "owner",
  "staff of B, cookie names A": "staff",
};
const ADMIN_ROLE: Partial<Record<string, "owner" | "support" | "moderator" | "finance">> = {
  "admin owner": "owner",
  "admin support": "support",
  "admin moderator": "moderator",
  "admin finance": "finance",
  "admin owner, on-list (IPv4-mapped)": "owner",
};

function expected(route: PortalRoute, col: string): Outcome["kind"] | `redirect ${string}` {
  const back = encodeURIComponent(route.path);
  if (route.portal === "customer") {
    if (route.access === "public") return "allow";
    return col === "signed out" ? `redirect /sign-in?returnTo=${back}` : "allow";
  }
  if (col === "signed out") return `redirect /staff/sign-in?returnTo=${back}`;
  if (route.portal === "shop") {
    if (col === "owner, no MFA") return "redirect /staff/security";
    if (col === "staff, stale (12 h)") {
      return route.roles.includes("staff")
        ? `redirect /staff/sign-in?returnTo=${back}`
        : "forbidden";
    }
    if (col === "owner, stale (12 h)") return `redirect /staff/sign-in?returnTo=${back}`;
    const role = SHOP_ROLE[col];
    return role && route.roles.includes(role) ? "allow" : "forbidden";
  }
  if (col === "admin owner, no MFA") return "redirect /staff/security";
  if (col === "admin owner, stale (2 h)") return `redirect /staff/sign-in?returnTo=${back}`;
  const role = ADMIN_ROLE[col];
  return role && route.roles.includes(role) ? "allow" : "forbidden";
}

const gateFor = (route: PortalRoute, ctx: { principal: Principal | null; shopCookie?: string }) => {
  switch (route.portal) {
    case "customer":
      return () => gateCustomerRoute(route.path, ctx);
    case "shop":
      return () => gateShopRoute(route.path, ctx);
    case "admin":
      return () => gateAdminRoute(route.path, ctx);
  }
};

describe("[P0-12] authz: portal route matrix (C-01, C-24)", () => {
  for (const route of PORTAL_ROUTES) {
    describe(route.path, () => {
      for (const col of COLUMNS) {
        const want = expected(route, col.name);
        it(`${col.name} → ${want}`, async () => {
          const w = await world();
          allowlist.value = col.list;
          try {
            const ctx = {
              principal: await col.principal(w),
              ...(col.shopCookie ? { shopCookie: col.shopCookie(w) } : {}),
            };
            const got = await outcome(gateFor(route, ctx));
            const label = got.kind === "redirect" ? `redirect ${got.to}` : got.kind;
            expect(label).toBe(want);
            // A cookie naming someone else's shop is never authority: the page acts on the user's own shop.
            if (
              col.name === "staff of B, cookie names A" &&
              got.kind === "allow" &&
              route.portal === "shop"
            ) {
              expect(got.shopId).toBe(w.shopB.id);
            }
            if (
              (col.name === "staff" || col.name === "owner") &&
              got.kind === "allow" &&
              route.portal === "shop"
            ) {
              expect(got.shopId).toBe(w.shopA.id);
            }
          } finally {
            allowlist.value = undefined;
          }
        });
      }
    });
  }

  it("a deactivated admin has no admin role: lands in the customer app", async () => {
    const p = await deactivatedAdmin();
    expect(p?.adminRole).toBeNull();
    expect(defaultPortalPath(p ?? { adminRole: null, shopRoles: [] })).toBe("/wallet");
  });
});
