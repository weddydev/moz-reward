import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { env } from "@/server/env";

/** /dev/* galleries: available locally and on staging (client demos), 404 in production (SECURITY §5). */
async function DevGate({ children }: { children: React.ReactNode }) {
  await connection();
  if (env().APP_ENV === "production") notFound();
  return <>{children}</>;
}

export default function DevLayout({ children }: LayoutProps<"/dev">): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <DevGate>{children}</DevGate>
    </Suspense>
  );
}
