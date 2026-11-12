import { PlaceholderPage } from "@/features/portal/PlaceholderPage";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "QR & NFC" };

export default async function AdminQrNfcPage(): Promise<React.JSX.Element> {
  await gateAdminRoute("/admin/qr-nfc");
  return <PlaceholderPage title="QR & NFC" message="Shop codes and NFC tags will show here." />;
}
