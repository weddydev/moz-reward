import { MemberScanner } from "@/features/scan/MemberScanner";
import { gateShopRoute } from "@/server/portal/gate";
import { readApproveLimits } from "@/server/repos/approvals";
import { listProgrammeVersions } from "@/server/repos/loyalty";
import { readQuickPicks } from "@/server/repos/point-requests";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Scan" };

/**
 * The member scanner (P2-02, PRODUCT §5 "Member QR scan", §18; DESIGN §15 screen 18): owner and staff. The camera
 * is allowed on this path only (`Permissions-Policy: camera=(self)`, SECURITY §5). The page reads what the award
 * panel's live gold preview needs (programme versions, quick-picks, the caller's limit and the platform cap);
 * the server prices and guards every award again.
 */
export default async function ShopScanPage(): Promise<React.JSX.Element> {
  const { shopId, scope, role } = await gateShopRoute("/dashboard/scan");
  const [versions, quickPicks, limits] = await Promise.all([
    listProgrammeVersions(scope),
    readQuickPicks(scope),
    readApproveLimits(scope),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Scan</h1>
        <p className="text-body text-ink-2">
          Scan a member&apos;s QR code, or type their member ID, to award gold.
        </p>
      </div>
      <MemberScanner
        shopId={shopId}
        role={role}
        preview={{ versions, quickPicks, cap: limits.cap, limit: limits.limit }}
      />
    </div>
  );
}
