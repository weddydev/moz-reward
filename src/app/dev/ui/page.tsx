import { UiGallery } from "@/features/dev/UiGallery";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "UI gallery", robots: { index: false, follow: false } };

export default function UiGalleryPage(): React.JSX.Element {
  return <UiGallery />;
}
