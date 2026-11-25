import "server-only";
import { parseShopId } from "@/lib/brand";
import { requireCustomer, requireShopRole } from "@/server/authz";
import { currentPrincipal } from "@/server/authz/principal";
import type { CustomerScope, ShopScope } from "@/server/authz/scope";
import { env } from "@/server/env";
import type { AppError } from "@/server/errors";
import { isAppError } from "@/server/errors";
import { privateStorage } from "@/server/integrations/storage";
import { writeOutbox } from "@/server/jobs/outbox";
import { log } from "@/server/log";
import { transaction } from "@/server/repos/_base";
import {
  readOwnReceiptFile,
  readTeamReceiptFile,
  type ReceiptFile,
  receiptPdfKey,
} from "@/server/repos/receipts";
import {
  ipLimit,
  limit,
  limiterRedis,
  tooManyRequests,
  userKey,
} from "@/server/security/rate-limit";
import { clientIp } from "@/server/security/request";

/**
 * Receipt PDF downloads (P1-12, PRODUCT §11): the customer's own receipts (`/api/me/receipts/<id>/pdf`) and a
 * shop team's (`/api/shops/<shopId>/receipts/<id>/pdf`). GET only; the web never renders a PDF, it streams the
 * worker's file from the private bucket after authorising the caller and reading the row in their scope.
 *
 * Order: per-IP limit → authorisation → per-user limit → scoped read → stream, or (no file yet) one
 * regeneration request and a 404 with Retry-After. Limits fail open: an authenticated read of the caller's own
 * data, not an auth or money endpoint (SECURITY §6). A receipt that doesn't exist, isn't the caller's, or has a
 * malformed id gets the same 404.
 */

export const DOWNLOAD_LIMITS = {
  ip: { max: 120, windowSec: 60 },
  user: { max: 30, windowSec: 60 },
} as const;

/** One regeneration request per receipt per 10 minutes (the job takes seconds; a broken one isn't hammered). */
export const REGEN_EVERY_SEC = 600;
export const NOT_READY_RETRY_SEC = 30;

export type ReceiptDownload = { kind: "me" } | { kind: "shop"; shopId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = (): Response =>
  Response.json(
    { error: { code: "NOT_FOUND", message: "We couldn't find that receipt." } },
    { status: 404, headers: { "Cache-Control": "private, no-store" } },
  );

const notReady = (): Response =>
  Response.json(
    {
      error: {
        code: "NOT_READY",
        message: "Your receipt is still being prepared. Please try again in a minute.",
      },
    },
    {
      status: 404,
      headers: { "Cache-Control": "private, no-store", "Retry-After": String(NOT_READY_RETRY_SEC) },
    },
  );

const errorResponse = (err: AppError): Response =>
  Response.json(
    { error: { code: err.code, message: err.message } },
    {
      status: err.status,
      headers: {
        "Cache-Control": "private, no-store",
        ...(err.retryAfterSec ? { "Retry-After": String(err.retryAfterSec) } : {}),
      },
    },
  );

/** The PDF itself: a download, never rendered inline as a page of ours, never cached anywhere. */
export function pdfResponse(number: number, body: Buffer): Response {
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipt-${String(Math.trunc(number))}.pdf"`,
      "Content-Length": String(body.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

/**
 * Asks the worker for the file again (the approval's job may have failed, or the object was lost: receipts are
 * regenerable from the database, ARCHITECTURE §8). At most once per receipt per REGEN_EVERY_SEC; with Redis
 * unreachable nothing is written (the caller retries later). The job runs under the caller's scope.
 */
async function requestRegeneration(
  scope: CustomerScope | ShopScope,
  row: ReceiptFile,
): Promise<void> {
  let first = false;
  try {
    const key = `${env().REDIS_KEY_PREFIX}receipt-pdf-regen:${row.id}`;
    first = (await limiterRedis().set(key, "1", "EX", REGEN_EVERY_SEC, "NX")) === "OK";
  } catch (err) {
    log().warn({ receiptId: row.id, err }, "receipt pdf regeneration skipped: redis unavailable");
    return;
  }
  if (!first) return;
  await transaction(scope, (tx) => writeOutbox(scope, tx, "pdf", "receipt", { receiptId: row.id }));
  log().info({ receiptId: row.id, shopId: row.shopId }, "receipt pdf regeneration requested");
}

export async function downloadReceiptPdf(
  request: Request,
  which: ReceiptDownload,
  receiptId: string,
): Promise<Response> {
  try {
    const ip = ipLimit("receipt-pdf", clientIp(request.headers), DOWNLOAD_LIMITS.ip);
    if (ip) {
      const r = await limit({ ...ip, onError: "open" });
      if (!r.ok) return tooManyRequests(r);
    }
    const principal = await currentPrincipal();
    let scope: CustomerScope | ShopScope;
    if (which.kind === "me") {
      scope = await requireCustomer(principal);
    } else {
      const shopId = parseShopId(which.shopId);
      if (!shopId) return notFound();
      scope = await requireShopRole(shopId, ["owner", "staff"], principal);
    }
    const perUser = await limit({
      key: userKey("receipt-pdf", scope.userId),
      ...DOWNLOAD_LIMITS.user,
      onError: "open",
    });
    if (!perUser.ok) return tooManyRequests(perUser);

    if (!UUID.test(receiptId)) return notFound();
    const id = receiptId.toLowerCase();
    const row =
      scope.kind === "customer"
        ? await readOwnReceiptFile(scope, id)
        : await readTeamReceiptFile(scope, id);
    if (!row) return notFound();

    // Only the key this row's file can have: a stored key that differs is never followed.
    const key = receiptPdfKey(row);
    const stored = row.pdfKey === key ? await privateStorage.get(key) : null;
    if (!stored || stored.body.length === 0) {
      await requestRegeneration(scope, row);
      return notReady();
    }
    return pdfResponse(row.number, stored.body);
  } catch (err) {
    if (isAppError(err)) return errorResponse(err);
    throw err;
  }
}
