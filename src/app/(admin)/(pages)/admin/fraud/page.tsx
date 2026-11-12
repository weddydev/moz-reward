import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Fraud monitor" };

export default async function AdminFraudPage(): Promise<React.JSX.Element> {
  await gateAdminRoute("/admin/fraud");
  return (
    <PlaceholderPage title="Fraud monitor" message="Flagged awards and accounts will show here." />
  );
}
