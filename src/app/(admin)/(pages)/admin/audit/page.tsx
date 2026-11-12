import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditPage(): Promise<React.JSX.Element> {
  await gateAdminRoute("/admin/audit");
  return <PlaceholderPage title="Audit log" message="Every recorded action will show here." />;
}
