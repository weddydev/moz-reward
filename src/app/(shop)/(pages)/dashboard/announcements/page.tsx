import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateShopRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Announcements" };

export default async function ShopAnnouncementsPage(): Promise<React.JSX.Element> {
  await gateShopRoute("/dashboard/announcements");
  return (
    <PlaceholderPage
      title="Announcements"
      message="Announcements you send to your members will show here."
    />
  );
}
