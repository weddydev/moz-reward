/** Fixtures for the `/dev/motion` route-transition demos (P0-10). Not real shops. */
export const DEMO_SHOPS = [
  { id: "brew-bloom", name: "Brew & Bloom Café", area: "Camden, London NW1" },
  { id: "patel-corner", name: "Patel's Corner Store", area: "Leicester LE2" },
  { id: "nans-bakery", name: "Nan's Bakery", area: "York YO1" },
] as const;
export type DemoShop = (typeof DEMO_SHOPS)[number];

export const demoShop = (id: string): DemoShop | undefined => DEMO_SHOPS.find((s) => s.id === id);

/** A bottom-nav order for the tab demo: moving right is forward, left is back. */
export const DEMO_TABS = [
  { slug: "wallet", label: "Wallet" },
  { slug: "explore", label: "Explore" },
  { slug: "me", label: "Me" },
] as const;

export const demoTabIndex = (slug: string): number => DEMO_TABS.findIndex((t) => t.slug === slug);
