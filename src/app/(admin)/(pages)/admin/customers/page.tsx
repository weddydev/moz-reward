import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Customers" };

export default async function AdminCustomersPage(): Promise<React.JSX.Element> {
  await gateAdminRoute("/admin/customers");
  return (
    <PlaceholderPage
      title="Customers"
      message="Customer lookup and data requests will show here."
    />
  );
}
