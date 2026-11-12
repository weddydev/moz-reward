import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateShopRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "QR & NFC kit" };

export default async function ShopKitPage(): Promise<React.JSX.Element> {
  await gateShopRoute("/dashboard/kit");
  return (
    <PlaceholderPage
      title="QR & NFC kit"
      message="Your poster, table tent and NFC tag will show here."
    />
  );
}
