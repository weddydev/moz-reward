import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Content settings" };

export default async function AdminContentPage(): Promise<React.JSX.Element> {
  await gateAdminRoute("/admin/content");
  return (
    <PlaceholderPage
      title="Content settings"
      message="Categories, keywords and templates will show here."
    />
  );
}
