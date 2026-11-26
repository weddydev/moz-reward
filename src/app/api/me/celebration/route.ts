import { claimCelebrationRoute } from "@/server/services/celebration-route";

export const dynamic = "force-dynamic";

/** P1-15: claim the signed-in customer's next "points credited" moment (POST only; see the service). */
export async function POST(request: Request): Promise<Response> {
  return claimCelebrationRoute(request);
}
