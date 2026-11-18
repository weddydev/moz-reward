import { LoyaltySettings } from "@/features/loyalty/LoyaltySettings";
import { historyView } from "@/features/loyalty/view";
import { gateShopRoute } from "@/server/portal/gate";
import { listProgrammeVersions } from "@/server/repos/loyalty";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Loyalty programme" };

/** Loyalty programme settings (P1-05, PRODUCT §6, §14): the shop owner only; staff get the 403 page. */
export default async function ShopLoyaltyPage(): Promise<React.JSX.Element> {
  const { shopId, scope } = await gateShopRoute("/dashboard/loyalty");
  const versions = await listProgrammeVersions(scope);
  return <LoyaltySettings shopId={shopId} {...historyView(versions, new Date())} />;
}
