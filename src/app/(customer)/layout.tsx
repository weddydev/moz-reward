import { PortalShell } from "@/features/portal/PortalShell";
import { navFor } from "@/features/portal/routes";
import { gatePortalLayout } from "@/server/portal/gate";

/**
 * Customer portal layout (P0-12). The gate runs before anything renders: a deny is a redirect or the 403 page
 * with no shell or nav. Layouts don't re-render on navigation, so every page calls its own gate as well.
 */
export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const { role } = await gatePortalLayout("customer");
  return (
    <PortalShell portal="customer" nav={navFor("customer", role ?? null)}>
      {children}
    </PortalShell>
  );
}
