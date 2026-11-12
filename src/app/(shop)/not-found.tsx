import { PortalNotFound } from "@/features/portal/StatePage";

/** `notFound()` from a shop portal page: shown inside the shell. */
export default function ShopNotFound(): React.JSX.Element {
  return <PortalNotFound portal="shop" />;
}
