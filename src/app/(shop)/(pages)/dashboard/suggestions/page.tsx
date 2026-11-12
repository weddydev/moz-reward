import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateShopRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Suggestions" };

export default async function ShopSuggestionsPage(): Promise<React.JSX.Element> {
  await gateShopRoute("/dashboard/suggestions");
  return (
    <PlaceholderPage title="Suggestions" message="Birthday and win-back drafts will show here." />
  );
}
