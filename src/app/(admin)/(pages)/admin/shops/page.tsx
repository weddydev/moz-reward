import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Shops" };

export default async function AdminShopsPage(): Promise<React.JSX.Element> {
  await gateAdminRoute("/admin/shops");
  return <PlaceholderPage title="Shops" message="Every shop on Moz Rewards will show here." />;
}
