import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateShopRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Feedback" };

export default async function ShopFeedbackPage(): Promise<React.JSX.Element> {
  await gateShopRoute("/dashboard/feedback");
  return (
    <PlaceholderPage
      title="Feedback"
      message="Private feedback from your customers will show here."
    />
  );
}
