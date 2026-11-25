import { PortalShell } from "@/features/portal/PortalShell";
import { navFor } from "@/features/portal/routes";
import { CustomerRealtime } from "@/features/realtime/CustomerRealtime";
import { QueuedRequestSender } from "@/features/shop/RequestPoints";
import { gatePortalLayout } from "@/server/portal/gate";
import { shellChrome } from "@/server/portal/shell";

/**
 * Customer portal layout (P0-12). The gate runs before anything renders: a signed-in page sends visitors to
 * sign in with no shell or nav (customer routes never answer 403). Layouts don't re-render on navigation, so every page calls its own gate as well.
 * P1-10: the layout holds the one realtime stream of the customer pages (it survives navigation).
 */
export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const gate = await gatePortalLayout("customer");
  const chrome = await shellChrome("customer", gate);
  return (
    <>
      {/* P1-10: realtime hints refresh the signed-in pages (outside the shell: renders nothing visible). */}
      {gate.principal ? <CustomerRealtime /> : null}
      {/* P1-11: sends "Request points" taps queued while offline, with their keys, once back online. */}
      {gate.principal ? <QueuedRequestSender /> : null}
      <PortalShell nav={navFor("customer", gate.role ?? null)} chrome={chrome}>
        {children}
      </PortalShell>
    </>
  );
}
