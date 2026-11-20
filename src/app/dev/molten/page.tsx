import { MoltenGallery } from "@/features/dev/molten/MoltenGallery";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Molten parity",
  robots: { index: false, follow: false },
};

export default function MoltenParityPage(): React.JSX.Element {
  return <MoltenGallery />;
}
