import { downloadReceiptPdf } from "@/server/services/receipt-download";

export const dynamic = "force-dynamic";

/** P1-12: one of the shop's receipts as a PDF download, for its owner or staff only (PRODUCT §11). GET only. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/shops/[shopId]/receipts/[receiptId]/pdf">,
): Promise<Response> {
  const { shopId, receiptId } = await ctx.params;
  return downloadReceiptPdf(request, { kind: "shop", shopId }, receiptId);
}
