import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateShopRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offers" };

export default async function ShopOffersPage(): Promise<React.JSX.Element> {
  await gateShopRoute("/dashboard/offers");
  return <PlaceholderPage title="Offers" message="Your offers and Daily Drops will show here." />;
}
