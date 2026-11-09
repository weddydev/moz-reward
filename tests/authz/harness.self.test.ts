import { describe, expect, it } from "vitest";
import type { AppErrorCode } from "@/server/errors";
import { ROLES, matrixVerdict } from "./harness";

const fail = (code: AppErrorCode) => ({ ok: false as const, error: { code, message: "x" } });

describe("[P0-07] authz matrix self-test: the harness rejects wrong outcomes", () => {
  it("covers every role in SECURITY §3 plus the no-MFA and inactive cases", () => {
    expect(ROLES).toEqual(
      expect.arrayContaining([
        "anonymous",
        "customer",
        "staff_other_shop",
        "staff_own_shop",
        "owner_own_shop",
        "admin_owner",
        "admin_support",
        "admin_moderator",
        "admin_finance",
        "owner_own_shop_no_mfa",
        "staff_own_shop_inactive",
      ]),
    );
  });

  it("allow: passes on success or a business outcome, fails on a denial or a crash", () => {
    expect(matrixVerdict("allow", { ok: true, data: 1 })).toBeNull();
    expect(matrixVerdict("allow", fail("NOT_FOUND"))).toBeNull();
    expect(matrixVerdict("allow", fail("VALIDATION"))).toBeNull();
    expect(matrixVerdict("allow", fail("FORBIDDEN"))).toMatch(/expected allow/);
    expect(matrixVerdict("allow", fail("LIMIT_REACHED"))).toMatch(/expected allow/);
    expect(matrixVerdict("allow", fail("INTERNAL"))).toMatch(/crashed/);
  });

  it("deny: passes only on a policy denial, fails on success or any other error", () => {
    for (const code of [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "MFA_REQUIRED",
      "REAUTH_REQUIRED",
    ] as const) {
      expect(matrixVerdict("deny", fail(code)), code).toBeNull();
    }
    expect(matrixVerdict("deny", { ok: true, data: 1 })).toMatch(/succeeded/);
    expect(matrixVerdict("deny", fail("NOT_FOUND"))).toMatch(/policy denial/);
    expect(matrixVerdict("deny", fail("INTERNAL"))).toMatch(/policy denial/);
  });
});
