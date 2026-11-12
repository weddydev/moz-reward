import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateShopRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Customers" };

export default async function ShopCustomersPage(): Promise<React.JSX.Element> {
  await gateShopRoute("/dashboard/customers");
  return (
    <PlaceholderPage title="Customers" message="Your members will show here once they join." />
  );
}
