import "server-only";
import { systemScope, type TenantScope } from "@/server/authz/scope";
import { privateStorage } from "@/server/integrations/storage";
import { log } from "@/server/log";
import { readReceiptFileFor, receiptPdfKey, recordReceiptPdfKey } from "@/server/repos/receipts";
import { parseReceiptData, renderReceiptPdf } from "./receipt-pdf";

/** moz_worker's single-column write (UPDATE(pdf_key)) after a tenant scope has read the row. */
const PDF_KEY_SCOPE = systemScope("worker: record a rendered receipt PDF's storage key");

export type ReceiptPdfResult =
  | { receiptId: string; bytes: number }
  | { receiptId: string; skipped: "not-visible" | "malformed" };

/**
 * `pdf:receipt` (P1-12, PRODUCT §11): renders a receipt to the private bucket. Runs under the scope that wrote
 * the outbox row (the approving team member, or the customer/team member whose download found no file), so it
 * renders only a receipt that scope can read. A receipt it can't see (e.g. the approver was removed from the
 * team before the job ran) or a malformed snapshot ends the job without a retry; the next download asks again.
 * Idempotent: the same receipt always renders to the same bytes at the same key.
 */
export async function renderReceiptJob(
  { receiptId }: { receiptId: string },
  scope: TenantScope,
): Promise<ReceiptPdfResult> {
  const row = await readReceiptFileFor(scope, receiptId);
  if (!row) {
    log().info(
      { receiptId, scope: scope.kind },
      "receipt pdf skipped: not visible to its producer",
    );
    return { receiptId, skipped: "not-visible" };
  }
  const data = parseReceiptData(row.data);
  if (!data) {
    log().warn({ receiptId, shopId: row.shopId }, "receipt pdf skipped: malformed snapshot");
    return { receiptId, skipped: "malformed" };
  }
  const key = receiptPdfKey(row);
  const pdf = await renderReceiptPdf(row.number, data);
  await privateStorage.put(key, pdf, "application/pdf");
  if (!(await recordReceiptPdfKey(PDF_KEY_SCOPE, row, key))) {
    log().warn(
      { receiptId, shopId: row.shopId },
      "receipt pdf stored but its key was not recorded",
    );
  }
  return { receiptId, bytes: pdf.length };
}
