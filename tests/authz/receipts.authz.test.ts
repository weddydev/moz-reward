import { GET as myReceiptPdf } from "@/app/api/me/receipts/[receiptId]/pdf/route";
import { GET as shopReceiptPdf } from "@/app/api/shops/[shopId]/receipts/[receiptId]/pdf/route";
import { newId } from "@/lib/id";
import type { ActionResult } from "@/server/actionTemplate";
import { authzMatrix, type Role } from "./harness";

/**
 * P1-12: receipt PDF downloads. The real route handlers run for each role with a receipt id nobody owns, so an
 * allowed role reaches the scoped read and gets NOT_FOUND; a denied role is stopped before it. Whose receipt a
 * caller may read (own, own shop's) is proven with real rows in tests/integration/receipt-download.test.ts.
 */
const SIGNED_IN: Role[] = [
  "customer",
  "staff_other_shop",
  "owner_other_shop",
  "staff_own_shop",
  "owner_own_shop",
  "owner_own_shop_no_mfa",
  "staff_own_shop_inactive",
  "admin_owner",
  "admin_support",
  "admin_moderator",
  "admin_finance",
  "admin_owner_no_mfa",
];

const request = (path: string): Request => new Request(`http://localhost:3100${path}`);

async function asResult(res: Response): Promise<ActionResult<unknown>> {
  if (res.status === 200) {
    await res.body?.cancel();
    return { ok: true, data: null };
  }
  const body = (await res.json()) as { error: { code: never; message: string } };
  return { ok: false, error: body.error };
}

authzMatrix("GET /api/me/receipts/[receiptId]/pdf", {
  // Any signed-in account reads its own receipts only (the read joins the caller's memberships).
  allow: SIGNED_IN,
  allowCodes: ["NOT_FOUND"],
  run: async () => {
    const receiptId = newId();
    return asResult(
      await myReceiptPdf(request(`/api/me/receipts/${receiptId}/pdf`), {
        params: Promise.resolve({ receiptId }),
      }),
    );
  },
});

authzMatrix("GET /api/shops/[shopId]/receipts/[receiptId]/pdf", {
  // Only shop A's active team with MFA; the other shop's team and every admin role are denied.
  allow: ["staff_own_shop", "owner_own_shop"],
  allowCodes: ["NOT_FOUND"],
  run: async (w) => {
    const receiptId = newId();
    return asResult(
      await shopReceiptPdf(request(`/api/shops/${w.shopA.id}/receipts/${receiptId}/pdf`), {
        params: Promise.resolve({ shopId: w.shopA.id, receiptId }),
      }),
    );
  },
});
