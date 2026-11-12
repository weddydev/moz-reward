import { PortalNotFound } from "@/features/portal/StatePage";

/** `notFound()` from a admin portal page: shown inside the shell. */
export default function AdminNotFound(): React.JSX.Element {
  return <PortalNotFound portal="admin" />;
}
