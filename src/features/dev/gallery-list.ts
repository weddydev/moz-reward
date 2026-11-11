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
  "HeroCard",
  "Icon",
  "IconButton",
  "KpiCard",
  "MilestoneTrack",
  "Modal",
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
  "Toaster",
] as const;

export type GalleryPrimitive = (typeof GALLERY_PRIMITIVES)[number];
