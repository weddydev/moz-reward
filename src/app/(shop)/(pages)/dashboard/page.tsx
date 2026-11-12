import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateShopRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Overview" };

export default async function ShopOverviewPage(): Promise<React.JSX.Element> {
  await gateShopRoute("/dashboard");
  return (
    <PlaceholderPage title="Overview" message="Today's activity for your shop will show here." />
  );
}
