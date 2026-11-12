import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateCustomerRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Scan" };

export default async function ScanPage(): Promise<React.JSX.Element> {
  await gateCustomerRoute("/scan");
  return <PlaceholderPage title="Scan" message={"Scan a shop's QR code here to collect gold."} />;
}
