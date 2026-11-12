import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateShopRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Staff" };

export default async function ShopStaffPage(): Promise<React.JSX.Element> {
  await gateShopRoute("/dashboard/staff");
  return <PlaceholderPage title="Staff" message="Invite and manage your team here." />;
}
