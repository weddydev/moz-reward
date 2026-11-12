import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateCustomerRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage(): Promise<React.JSX.Element> {
  await gateCustomerRoute("/notifications");
  return <PlaceholderPage title="Notifications" message="News from your shops will show here." />;
}
