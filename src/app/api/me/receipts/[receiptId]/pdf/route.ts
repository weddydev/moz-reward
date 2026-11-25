import { downloadReceiptPdf } from "@/server/services/receipt-download";

export const dynamic = "force-dynamic";

/** P1-12: the signed-in customer's own receipt as a PDF download (PRODUCT §11). GET only. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/me/receipts/[receiptId]/pdf">,
): Promise<Response> {
  const { receiptId } = await ctx.params;
  return downloadReceiptPdf(request, { kind: "me" }, receiptId);
}
