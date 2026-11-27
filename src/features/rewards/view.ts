import { validUntilLabel } from "@/lib/loyalty/redeem";

/** One unredeemed, unexpired reward as the lists show it (dates already in UK copy). */
export type ReadyRewardView = {
  id: string;
  label: string;
  shopName: string;
  /** The reward's picture (the shop's logo for now), or null: the shop's coin then. */
  imageUrl: string | null;
  /** "Valid until 2 Apr 2027". */
  validUntil: string;
};

/** A ready reward as the lists show it (P1-16): its label, shop and "Valid until 2 Apr 2027". */
export function readyRewardView(r: {
  id: string;
  label: string;
  shopName: string;
  shopLogoUrl: string | null;
  expiresAt: Date;
}): ReadyRewardView {
  return {
    id: r.id,
    label: r.label,
    shopName: r.shopName,
    imageUrl: r.shopLogoUrl,
    validUntil: validUntilLabel(r.expiresAt),
  };
}
