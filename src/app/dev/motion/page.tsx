import { MotionGallery } from "@/features/dev/motion/MotionGallery";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Motion gallery",
  robots: { index: false, follow: false },
};

export default function MotionGalleryPage(): React.JSX.Element {
  return <MotionGallery />;
}
