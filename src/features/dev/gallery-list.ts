/**
 * Every primitive exported from `src/components/ui`, each with its own block on `/dev/ui` (P0-09 AC 1).
 * `gallery-list.test.ts` fails when an export is missing here (or the reverse); the E2E finds a
 * `[data-primitive="<name>"]` block for every name. Helpers (lower-case exports such as `toast`) and types
 * are not primitives.
 */
export const GALLERY_PRIMITIVES = [
  "Avatar",
  "Badge",
  "BottomSheet",
  "Button",
  "Card",
  "Checkbox",
  "Chip",
  "ChipGroup",
  "EmptyState",
  "ErrorState",
  "Icon",
  "IconButton",
  "KpiCard",
  "LiquidChoice",
  "MilestoneTrack",
  "Modal",
  "OfferCard",
  "ProgressBar",
  "RadioGroup",
  "SegmentedControl",
  "Select",
  "ShopCard",
  "SidePanel",
  "Skeleton",
  "Sparkline",
  "Spinner",
  "Switch",
  "Table",
  "Tabs",
  "TextArea",
  "TextField",
  "Tile",
  "Toaster",
] as const;

/**
 * C-94 (P1-C close): every other component built (Molten parts from PD and P1 that `src/components/ui` doesn't
 * re-export, and the motion components a person looks at), each in its states on `/dev/ui` so the human can
 * review it side by side with the Molten demo. `gallery-list.test.ts` scans `src/components/ui` and
 * `src/components/motion` for component exports: each one is here, in GALLERY_PRIMITIVES, or in
 * NOT_A_GALLERY_PART with the reason it isn't shown on its own.
 */
export const GALLERY_PARTS = [
  "CountUp",
  "CoverPhoto",
  "Dock",
  "GildedEdge",
  "GoldVault",
  "Ingot",
  "IngotPour",
  "MemberCard",
  "MiniVault",
  "ReceiptCard",
  "RedeemCode",
  "RewardUnlocked",
  "ShopCoin",
  "ShopImage",
  "Slider",
  "StarRating",
] as const;

/** Component exports that have no block of their own, and why. */
export const NOT_A_GALLERY_PART: Readonly<Record<string, string>> = {
  Overlay: "the base of Modal, SidePanel and BottomSheet (shown as those)",
  CoverArt:
    "the shop landing cover's picture inside the page and the Gilded Gate (shown with CoverPhoto)",
  FieldMessage: "the error/hint line inside TextField, Select and TextArea (shown there)",
  MemberCardQrPlaceholder: "the back face of MemberCard (shown by flipping it)",
  DockWallet: "a dock glyph (shown inside Dock)",
  DockOffers: "a dock glyph (shown inside Dock)",
  DockScan: "a dock glyph (shown inside Dock)",
  DockMarket: "a dock glyph (shown inside Dock)",
  DockMe: "a dock glyph (shown inside Dock)",
  DialogFx:
    "a second particle canvas inside a modal's top layer (P1-15 celebration; /dev/motion Celebrations)",
  FxCanvas: "the page's one particle canvas (root layout; every burst on this page draws on it)",
  GooFilter: "the SVG goo filter (root layout; LiquidChoice and Dock use it)",
  GateScene: "the Gilded Gate's markup (the full scene plays on /dev/molten and on shop landings)",
  GildedGate: "a full-screen entry animation (/dev/molten Intro, and /s/<code> on first visit)",
  GildedGateMorph: "the Gilded Gate's hand-over to the landing (/dev/molten Intro)",
  GildedGateLoader: "loads the Gilded Gate's lazy chunk (no UI of its own)",
  LivingBackground: "the page background itself (root layout; this page shows it)",
  Popover: "positioning for menus (shown as Select's list)",
  RouteContent: "route transition wrapper (no UI of its own; /dev/motion)",
  RouteTransition: "route transition wrapper (no UI of its own; /dev/motion)",
  SharedElement: "shared-element morph between routes (/dev/motion)",
  TransitionLink: "a link that runs route transitions (/dev/motion)",
  WipeStage: "the card-to-shop gold wipe stage (/dev/molten phone)",
};

export type GalleryPrimitive = (typeof GALLERY_PRIMITIVES)[number] | (typeof GALLERY_PARTS)[number];
