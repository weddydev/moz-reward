import { PortalNotFound } from "@/features/portal/StatePage";

/** `notFound()` from a customer portal page: shown inside the shell. */
export default function CustomerNotFound(): React.JSX.Element {
  return <PortalNotFound portal="customer" />;
}
