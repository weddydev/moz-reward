import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Applications" };

export default async function AdminApplicationsPage(): Promise<React.JSX.Element> {
  await gateAdminRoute("/admin/applications");
  return (
    <PlaceholderPage
      title="Applications"
      message="Shop applications waiting for review will show here."
    />
  );
}
