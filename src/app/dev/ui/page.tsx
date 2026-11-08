import type { Metadata } from "next";
import { UiGallery } from "@/features/dev/UiGallery";

export const metadata: Metadata = { title: "UI gallery", robots: { index: false, follow: false } };

export default function UiGalleryPage() {
  return <UiGallery />;
}
