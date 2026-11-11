import { Suspense } from "react";
import { DevGate } from "@/features/dev/DevGate";

/** /dev/* galleries: 404 in production (DevGate). */
export default function DevLayout({ children }: LayoutProps<"/dev">): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <DevGate>{children}</DevGate>
    </Suspense>
  );
}
