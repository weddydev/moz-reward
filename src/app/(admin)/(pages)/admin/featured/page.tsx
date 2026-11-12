import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Featured slots" };

export default async function AdminFeaturedPage(): Promise<React.JSX.Element> {
  await gateAdminRoute("/admin/featured");
  return (
    <PlaceholderPage title="Featured slots" message="Featured marketplace slots will show here." />
  );
}
