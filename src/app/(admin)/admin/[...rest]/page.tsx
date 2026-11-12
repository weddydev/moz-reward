import { unknownPortalPath } from "@/server/portal/catch-all";
import { gateAdminRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Any path under /admin that has no page of its own (P0-12). Gated like the portal root first, so a
 * visitor is sent to sign in and a wrong role gets the 403 page before anyone learns the path is unknown.
 * It sits outside `loading.tsx`, so the answer is a real 404 inside the portal shell.
 */
export default async function AdminUnknownPage({
  params,
}: {
  params: Promise<{ rest: string[] }>;
}): Promise<never> {
  await gateAdminRoute("/admin");
  return unknownPortalPath((await params).rest);
}
