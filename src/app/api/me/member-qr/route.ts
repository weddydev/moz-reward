import { memberQrResponse } from "@/server/services/member-qr-route";

export const dynamic = "force-dynamic";

/** P1-14: the signed-in customer's member QR token and card details (PRODUCT §18). GET only. */
export async function GET(request: Request): Promise<Response> {
  return memberQrResponse(request);
}
