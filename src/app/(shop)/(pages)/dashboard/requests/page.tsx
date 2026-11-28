import { RequestsBoard } from "@/features/requests/RequestsBoard";
import { decodeCursor, encodeCursor, parseTab, REQUESTS_PAGE_SIZE } from "@/features/requests/tabs";
import { boardRows } from "@/features/requests/view";
import { RedeemConfirm } from "@/features/rewards/RedeemConfirm";
import { REQUEST_TTL_MS } from "@/lib/requests";
import { londonDayStart } from "@/lib/time";
import { gateShopRoute } from "@/server/portal/gate";
import { readApproveLimits } from "@/server/repos/approvals";
import { listProgrammeVersions } from "@/server/repos/loyalty";
import {
  countRequestTabs,
  listTeamRequestsPage,
  readQuickPicks,
} from "@/server/repos/point-requests";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Requests" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The shop's Requests page (P2-02, PRODUCT §5, §14; DESIGN §15 screen 18): owner and staff. Tabs Pending /
 * Awaiting owner / Approved today / Expired, newest first, keyset pages (`?tab=…&before=…`, parsed as untrusted
 * text). Approve opens a side panel from 1024 px and a number-pad sheet on phones, with the shop's quick-picks
 * and a live gold preview from the loyalty engine; the server prices and guards the award again.
 * `?approve=<id>` (from the member scanner) opens that request's approve panel when it is on this tab and the
 * caller may decide it; anything else in it is ignored. The shop's realtime stream (shop layout) refreshes the
 * page when a request arrives or is decided elsewhere.
 */
export default async function ShopRequestsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  const { shopId, scope, role } = await gateShopRoute("/dashboard/requests");
  const query = await searchParams;
  const tab = parseTab(query["tab"]);
  const before = decodeCursor(query["before"]);
  const approve = query["approve"];
  const openId = typeof approve === "string" && UUID.test(approve) ? approve.toLowerCase() : null;
  const now = new Date();
  const span = {
    requestedAfter: new Date(now.getTime() - REQUEST_TTL_MS),
    dayStart: londonDayStart(now),
  };
  const [page, counts, versions, quickPicks, limits] = await Promise.all([
    listTeamRequestsPage(scope, { ...span, tab, before, limit: REQUESTS_PAGE_SIZE }),
    countRequestTabs(scope, span),
    listProgrammeVersions(scope),
    readQuickPicks(scope),
    readApproveLimits(scope),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Requests</h1>
        <p className="text-body text-ink-2">
          Approve member visits, award gold and redeem rewards.
        </p>
      </div>
      <RedeemConfirm shopId={shopId} />
      <RequestsBoard
        shopId={shopId}
        tab={tab}
        counts={counts}
        rows={boardRows(page.rows, { versions, role, now })}
        older={page.next ? encodeCursor(page.next) : null}
        paged={before !== null}
        preview={{ versions, quickPicks, cap: limits.cap, limit: limits.limit }}
        openId={openId}
      />
    </div>
  );
}
