import { ShopRealtime } from "@/features/realtime/ShopRealtime";
import { RequestsQueue } from "@/features/requests/RequestsQueue";
import { queueRows } from "@/features/requests/view";
import { gateShopRoute } from "@/server/portal/gate";
import { listProgrammeVersions } from "@/server/repos/loyalty";
import { listTeamOpenRequests } from "@/server/repos/point-requests";
import { REQUEST_TTL_MS } from "@/server/services/point-request-jobs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Requests" };

/**
 * The shop's open points requests (P1-12, PRODUCT §5): owner and staff. Requests still inside their 24 h (the
 * expiry job may not have run yet), oldest first, with each member's name and member ID from the staff
 * member-card read (0030). The full Requests page (tabs, search, history) is P2.
 */
export default async function ShopRequestsPage(): Promise<React.JSX.Element> {
  const { shopId, scope, role } = await gateShopRoute("/dashboard/requests");
  const now = new Date();
  const [requests, versions] = await Promise.all([
    listTeamOpenRequests(scope, { requestedAfter: new Date(now.getTime() - REQUEST_TTL_MS) }),
    listProgrammeVersions(scope),
  ]);
  const rows = queueRows(requests, { versions, role, now });
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Requests</h1>
        <p className="text-body text-ink-2">Approve member visits and award gold.</p>
      </div>
      <RequestsQueue shopId={shopId} rows={rows} />
      <ShopRealtime shopId={shopId} />
    </div>
  );
}
