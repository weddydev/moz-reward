import { authzMatrix, type Role } from "./harness";
import {
  probeAdminFinance,
  probeAnyAdmin,
  probeCustomer,
  probeShopOwner,
  probeShopStaff,
  probeStaffAward,
} from "./probes";

const SIGNED_IN: Role[] = [
  "customer",
  "staff_other_shop",
  "owner_other_shop",
  "staff_own_shop",
  "owner_own_shop",
  "owner_own_shop_no_mfa",
  "staff_own_shop_inactive",
  "admin_owner",
  "admin_support",
  "admin_moderator",
  "admin_finance",
  "admin_owner_no_mfa",
];

authzMatrix("probe: requireCustomer", { allow: SIGNED_IN, run: () => probeCustomer({}) });

authzMatrix("probe: requireShopRole(owner|staff) on shop A", {
  allow: ["staff_own_shop", "owner_own_shop"],
  run: (w) => probeShopStaff({ shopId: w.shopA.id }),
});

authzMatrix("probe: requireShopRole(owner) on shop A", {
  allow: ["owner_own_shop"],
  run: (w) => probeShopOwner({ shopId: w.shopA.id }),
});

authzMatrix("probe: requireShopRole(owner|staff) on shop B (cross-shop)", {
  // Only shop B's own team; shop A's staff and owner must be denied.
  allow: ["staff_other_shop", "owner_other_shop"],
  run: (w) => probeShopStaff({ shopId: w.shopB.id }),
});

authzMatrix("probe: requireStaffAwardLimit on shop A, 150 points (within staff limit 200)", {
  allow: ["staff_own_shop", "owner_own_shop"],
  run: (w) => probeStaffAward({ shopId: w.shopA.id, points: 150 }),
});

authzMatrix("probe: requireStaffAwardLimit on shop A, 250 points (over staff limit 200)", {
  // Staff over their per-award limit are denied (owner approval needed); owners have no cap.
  allow: ["owner_own_shop"],
  run: (w) => probeStaffAward({ shopId: w.shopA.id, points: 250 }),
});

authzMatrix("probe: requireAdminRole(any)", {
  allow: ["admin_owner", "admin_support", "admin_moderator", "admin_finance"],
  run: () => probeAnyAdmin({}),
});

authzMatrix("probe: requireAdminRole(owner|finance)", {
  allow: ["admin_owner", "admin_finance"],
  run: () => probeAdminFinance({}),
});
