import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Team" };

export default async function AdminTeamPage(): Promise<React.JSX.Element> {
  await gateAdminRoute("/admin/team");
  return (
    <PlaceholderPage
      title="Team"
      message="Admins, their roles and two-step verification status will show here."
    />
  );
}
