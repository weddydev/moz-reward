import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateCustomerRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Wallet" };

export default async function WalletPage(): Promise<React.JSX.Element> {
  await gateCustomerRoute("/wallet");
  return <PlaceholderPage title="Wallet" message="Your loyalty cards will show here." />;
}
