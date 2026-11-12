import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverviewPage(): Promise<React.JSX.Element> {
  await gateAdminRoute("/admin");
  return (
    <PlaceholderPage title="Overview" message="Platform activity and alerts will show here." />
  );
}
