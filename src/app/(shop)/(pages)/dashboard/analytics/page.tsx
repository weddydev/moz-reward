import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateShopRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analytics" };

export default async function ShopAnalyticsPage(): Promise<React.JSX.Element> {
  await gateShopRoute("/dashboard/analytics");
  return (
    <PlaceholderPage
      title="Analytics"
      message="Visits, gold issued and member growth will show here."
    />
  );
}
