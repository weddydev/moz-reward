import type { Portal } from "../routes";
import type { PortalLink } from "../switcher";

/** Plan states (PRODUCT §14); mirrors the `shop_status` enum. */
export type ShopStatus =
  "pending" | "active" | "expiring" | "grace" | "restricted" | "suspended" | "closed";

/** What the client shell components receive (serialisable; built by `src/server/portal/shell.ts`). */
export type ShellShop = { id: string; name: string; town: string | null; status: ShopStatus };

export type ShellProps = {
  portal: Portal;
  signedIn: boolean;
  portals: readonly PortalLink[];
  shops: readonly ShellShop[];
  activeShopId: string | null;
  /** The shop or admin role in this portal ("owner", "support"…); null in the customer portal. Display only. */
  role: string | null;
};
