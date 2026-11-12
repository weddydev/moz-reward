import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateShopRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Requests" };

export default async function ShopRequestsPage(): Promise<React.JSX.Element> {
  await gateShopRoute("/dashboard/requests");
  return (
    <PlaceholderPage
      title="Requests"
      message="Points requests from your customers will show here."
    />
  );
}
