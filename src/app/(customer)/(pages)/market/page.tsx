import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateCustomerRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Market" };

export default async function MarketPage(): Promise<React.JSX.Element> {
  await gateCustomerRoute("/market");
  return (
    <PlaceholderPage title="Market" message="Local shops and their listings will show here." />
  );
}
