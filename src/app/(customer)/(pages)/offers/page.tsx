import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateCustomerRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offers" };

export default async function OffersPage(): Promise<React.JSX.Element> {
  await gateCustomerRoute("/offers");
  return <PlaceholderPage title="Offers" message="Offers from shops near you will show here." />;
}
