import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Moderation" };

export default async function AdminModerationPage(): Promise<React.JSX.Element> {
  await gateAdminRoute("/admin/moderation");
  return (
    <PlaceholderPage
      title="Moderation"
      message="Reported listings, banners and feedback will show here."
    />
  );
}
