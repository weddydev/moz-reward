import { PortalShell } from "@/features/portal/PortalShell";
import { navFor } from "@/features/portal/routes";
import { ShopRealtime } from "@/features/realtime/ShopRealtime";
import { gatePortalLayout } from "@/server/portal/gate";
import { shellChrome } from "@/server/portal/shell";

/**
 * Shop portal layout (P0-12). The gate runs before anything renders: a deny is a redirect or the 403 page
 * with no shell or nav. Layouts don't re-render on navigation, so every page calls its own gate as well.
 * The shop's realtime stream lives here (P1-12, code review M3), outside the page transition, so it stays open
 * across dashboard pages: a request hint refreshes the Requests queue and the owner's nav count alike.
 */
export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const gate = await gatePortalLayout("shop");
  const chrome = await shellChrome("shop", gate);
  return (
    <>
      <PortalShell nav={navFor("shop", gate.role ?? null)} chrome={chrome}>
        {children}
      </PortalShell>
      {gate.shopId ? <ShopRealtime key={gate.shopId} shopId={gate.shopId} /> : null}
    </>
  );
}
