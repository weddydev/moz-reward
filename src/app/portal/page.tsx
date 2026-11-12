import { redirect } from "next/navigation";
import { defaultPortalPath } from "@/features/portal/routes";
import { currentPrincipal } from "@/server/authz/principal";

/**
 * `/portal`: where a signed-in user lands when no page was asked for (C-02): admins in the admin portal, shop
 * staff in their dashboard, everyone else in the wallet; signed out → the customer sign-in. Navigation only:
 * the target's gate decides. The proxy marks it `private, no-store`.
 */
export default async function PortalHome(): Promise<never> {
  const p = await currentPrincipal();
  redirect(p ? defaultPortalPath(p) : "/sign-in");
}
