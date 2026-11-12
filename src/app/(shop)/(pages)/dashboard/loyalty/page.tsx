import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateShopRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Loyalty programme" };

export default async function ShopLoyaltyPage(): Promise<React.JSX.Element> {
  await gateShopRoute("/dashboard/loyalty");
  return (
    <PlaceholderPage
      title="Loyalty programme"
      message="Set up how your members earn and redeem gold here."
    />
  );
}
