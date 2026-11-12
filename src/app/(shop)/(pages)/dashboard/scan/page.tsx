import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateShopRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Scan" };

export default async function ShopScanPage(): Promise<React.JSX.Element> {
  await gateShopRoute("/dashboard/scan");
  return <PlaceholderPage title="Scan" message={"Scan a member's QR code here to award gold."} />;
}
