import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Plans & payments" };

export default async function AdminPlansPage(): Promise<React.JSX.Element> {
  await gateAdminRoute("/admin/plans");
  return (
    <PlaceholderPage title="Plans & payments" message="Shop plans and payments will show here." />
  );
}
