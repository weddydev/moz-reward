import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateCustomerRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Me" };

export default async function MePage(): Promise<React.JSX.Element> {
  await gateCustomerRoute("/me");
  return <PlaceholderPage title="Me" message="Your profile and settings will show here." />;
}
