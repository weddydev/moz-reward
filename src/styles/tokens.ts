/**
 * The few token values needed as literal colours outside CSS (the `<meta name="theme-color">`, the TOTP
 * QR code and HTML emails can't use CSS variables). `tokens.css` stays the source of truth: `tokens.test.ts` fails if these drift.
 */
export const colourTokens = {
  bg: "#fbf8f1",
  surface: "#ffffff",
  ink: "#1c1a17",
  "ink-2": "#5c564c",
  line: "#e8dfce",
  "gold-700": "#8a6a1f",
} as const;

/** Spring for press release and sheets (DESIGN §7). A spring has no CSS form, so Motion reads it from here. */
export const spring = { type: "spring", stiffness: 380, damping: 32 } as const;

export type TokenKind =
  "colour" | "gradient" | "space" | "radius" | "shadow" | "duration" | "easing" | "size" | "number";
export type TokenInfo = { name: string; use: string };
export type TokenGroup = { title: string; kind: TokenKind; tokens: readonly TokenInfo[] };

/**
 * Every custom property in `tokens.css`, with what it is for. Names only: values are read from the CSS at run
 * time (the /dev/ui token page) or parsed from the file (tests), never repeated here. `tokens.test.ts` fails
 * when this list and `tokens.css` differ, so the token page can't miss one.
 */
export const TOKEN_GROUPS: readonly TokenGroup[] = [
  {
    title: "Colour",
    kind: "colour",
    tokens: [
      { name: "bg", use: "App background (warm ivory)" },
      { name: "surface", use: "Cards, sheets" },
      { name: "surface-2", use: "Subtle panels, inputs, skeletons" },
      { name: "ink", use: "Primary text" },
      { name: "ink-2", use: "Secondary text" },
      { name: "ink-3", use: "Tertiary text, placeholders (not body copy)" },
      { name: "line", use: "Borders, dividers" },
      { name: "gold-700", use: "Gold text on ivory (large text), icons" },
      { name: "gold-500", use: "Gold accents, progress" },
      { name: "gold-300", use: "Highlights, shimmer" },
      { name: "gold-100", use: "Gold tint backgrounds" },
      { name: "success", use: "Success states" },
      { name: "warning", use: "Warnings" },
      { name: "danger", use: "Errors, destructive actions" },
      { name: "focus", use: "Focus ring (inner, ink)" },
      { name: "focus-ring", use: "Focus ring (2px outer, gold)" },
      { name: "on-danger", use: "Text on a danger background" },
      { name: "success-tint", use: "Success badge background" },
      { name: "warning-tint", use: "Warning badge and notice background" },
    ],
  },
  {
    title: "Gradient",
    kind: "gradient",
    tokens: [{ name: "gold-gradient", use: "Primary buttons, ingot fill, member card edge" }],
  },
  {
    title: "Space",
    kind: "space",
    tokens: [
      { name: "space-unit", use: "The unit spacing utilities multiply (p-4 = 16px)" },
      ...[4, 8, 12, 16, 20, 24, 32, 40, 56, 72, 96].map((px) => ({
        name: `space-${String(px)}`,
        use: `Spacing step ${String(px)}px`,
      })),
    ],
  },
  {
    title: "Radius",
    kind: "radius",
    tokens: [
      { name: "r-sm", use: "Small controls, badges" },
      { name: "r-md", use: "Cards, inputs" },
      { name: "r-lg", use: "Sheets, hero cards" },
      { name: "r-pill", use: "Pills, chips, round buttons" },
    ],
  },
  {
    title: "Elevation",
    kind: "shadow",
    tokens: [
      { name: "shadow-1", use: "Cards" },
      { name: "shadow-2", use: "Sheets, menus, toasts" },
      { name: "shadow-gold", use: "Primary button and reward cards only" },
      { name: "shadow-gold-pressed", use: "Primary button while pressed" },
    ],
  },
  {
    title: "Motion: durations",
    kind: "duration",
    tokens: [
      { name: "dur-fast", use: "Press, hover, toggles" },
      { name: "dur-base", use: "Sheets, tabs, small transitions" },
      { name: "dur-slow", use: "Page transitions, card to page" },
      { name: "dur-hero", use: "Signature moments only (900–1600ms each)" },
      { name: "dur-exit", use: "Leaving elements (toast dismiss)" },
      { name: "dur-sheen", use: "Primary button hover sheen" },
      { name: "dur-shimmer", use: "Skeleton shimmer loop" },
      { name: "dur-reduced", use: "Longest fade when motion is reduced" },
    ],
  },
  {
    title: "Motion: easing",
    kind: "easing",
    tokens: [
      { name: "ease-out", use: "Entrances" },
      { name: "ease-in-out", use: "Moves" },
    ],
  },
  {
    title: "Texture",
    kind: "number",
    tokens: [
      { name: "foil-opacity", use: "Foil overlay on hero cards and the member card (≤ 0.06)" },
    ],
  },
  {
    title: "Layout",
    kind: "size",
    tokens: [
      { name: "rail-w", use: "Desktop rail, collapsed" },
      { name: "rail-w-open", use: "Desktop rail, open" },
      { name: "sidebar-w", use: "Dashboard and admin sidebar" },
      { name: "bottom-nav-h", use: "Mobile bottom navigation" },
      { name: "content-max", use: "Mobile content column" },
      { name: "content-max-desktop", use: "Desktop content width" },
    ],
  },
];

/** Type scale (DESIGN §4): utility class, mobile / desktop size in px. The sizes live in globals.css. */
export const TYPE_SCALE = [
  { utility: "text-display", label: "Display", mobile: 34, desktop: 48 },
  { utility: "text-h1", label: "H1", mobile: 28, desktop: 36 },
  { utility: "text-h2", label: "H2", mobile: 22, desktop: 28 },
  { utility: "text-h3", label: "H3", mobile: 18, desktop: 20 },
  { utility: "text-body", label: "Body", mobile: 16, desktop: 16 },
  { utility: "text-small", label: "Small", mobile: 14, desktop: 14 },
  { utility: "text-caption", label: "Caption", mobile: 12, desktop: 12 },
] as const;
