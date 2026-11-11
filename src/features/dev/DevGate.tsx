import { notFound } from "next/navigation";
import { connection } from "next/server";
import { env } from "@/server/env";

/**
 * /dev/* galleries (/dev/ui, /dev/motion, …): available locally and on staging (client demos), 404 in
 * production (SECURITY §5). Read per request, so one build serves both.
 */
export async function DevGate({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  await connection();
  if (env().APP_ENV === "production") notFound();
  return <>{children}</>;
}
