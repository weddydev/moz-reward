import { unknownPortalPath } from "@/server/portal/catch-all";
import { gateCustomerRoute } from "@/server/portal/gate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Any path under /wallet that has no page of its own (P0-12). Gated like the portal root first, so a
 * visitor is sent to sign in and a wrong role gets the 403 page before anyone learns the path is unknown.
 * It sits outside `loading.tsx`, so the answer is a real 404 inside the portal shell.
 */
export default async function CustomerUnknownPage({
  params,
}: {
  params: Promise<{ rest: string[] }>;
}): Promise<never> {
  await gateCustomerRoute("/wallet");
  return unknownPortalPath((await params).rest);
}
