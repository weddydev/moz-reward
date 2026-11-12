import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateShopRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default async function ShopSettingsPage(): Promise<React.JSX.Element> {
  await gateShopRoute("/dashboard/settings");
  return (
    <PlaceholderPage
      title="Settings"
      message="Your shop profile, opening hours and plan will show here."
    />
  );
}
