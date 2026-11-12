import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Broadcasts" };

export default async function AdminBroadcastsPage(): Promise<React.JSX.Element> {
  await gateAdminRoute("/admin/broadcasts");
  return (
    <PlaceholderPage
      title="Broadcasts"
      message={"Messages to every shop's staff will show here."}
    />
  );
}
