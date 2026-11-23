/**
 * The few token values needed as literal colours outside CSS (the `<meta name="theme-color">`, the TOTP
 * QR code and HTML emails can't use CSS variables). `tokens.css` stays the source of truth: `tokens.test.ts` fails if these drift.
 */
export const colourTokens = {
  bg: "#fbf8f1",
  surface: "#ffffff",
  ink: "#1a140a",
  "ink-2": "#5b4f3c",
  line: "#e9dcbe",
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
      { name: "focus", use: "Focus ring (2px outline, ink)" },
      { name: "focus-ring", use: "Focus ring (5px gold halo)" },
      { name: "on-danger", use: "Text on a danger background" },
      { name: "success-tint", use: "Success badge background" },
      { name: "warning-tint", use: "Warning badge and notice background" },
      { name: "scrim", use: "Dim layer behind Modal, SidePanel and BottomSheet" },
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
      { name: "tgl-ring", use: "Coin switch track's inset ring (PD-05)" },
      { name: "gold-pulse-0", use: "Coin switch landing pulse, start (PD-05)" },
      { name: "gold-pulse-1", use: "Coin switch landing pulse, end: faded out (PD-05)" },
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
      { name: "dur-instant", use: "A step change at the end of a transition (rail item width)" },
      {
        name: "delay-intent",
        use: "Hover intent before a hover-opened panel opens (customer rail)",
      },
      { name: "dur-sheen", use: "Primary button hover sheen" },
      { name: "dur-shimmer", use: "Skeleton shimmer loop" },
      { name: "dur-spin", use: "One spinner turn (fast spin feels faster)" },
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
    title: "Motion: switch",
    kind: "number",
    tokens: [
      { name: "motion-on", use: "1, or 0 when motion is reduced (overlays then only fade)" },
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
    title: "Molten colour (v2)",
    kind: "colour",
    tokens: [
      { name: "pearl", use: "App background (Molten)" },
      { name: "ivory", use: "Tracks, inputs, mould" },
      { name: "champagne", use: "Warm panels, stage edges" },
      { name: "gold-deep", use: "Gold text on light, icons" },
      { name: "gold", use: "Accents, outlines" },
      { name: "gold-bright", use: "Highlights, rings, glow" },
      { name: "gold-light", use: "Tints, gold text on obsidian" },
      { name: "ember", use: "Alerts, badges, urgency only" },
      { name: "obsidian", use: "Dark panels" },
      { name: "obsidian-2", use: "Dark panel depth" },
      { name: "iri-rose", use: "Pearl sheen: glows and foil only" },
      { name: "iri-mint", use: "Pearl sheen: glows and foil only" },
      { name: "iri-lilac", use: "Pearl sheen: glows and foil only" },
      { name: "gild-amber", use: "Gilded edge line start, metal text" },
      { name: "gild-honey", use: "Gilded edge, gem facet" },
      { name: "gild-sun", use: "Gilded edge, gem facet" },
      { name: "gild-brass", use: "Gilded edge fade" },
      { name: "gild-bronze", use: "Gem shadow facet" },
      { name: "gild-ochre", use: "Gem facet, edge echo" },
      { name: "gild-satin", use: "Edge echo fade" },
      { name: "gild-cream", use: "Gem light facet, type shine" },
      { name: "gild-shine", use: "Light gliding along the edge" },
      { name: "gild-glint", use: "Gem glint star" },
      { name: "pour-edge", use: "Coin switch pour, its bulging leading edge (PD-05)" },
      { name: "star-off", use: "Star rating, an unlit star (PD-06)" },
      { name: "star-hover", use: "Star rating, stars under a hovering pointer (PD-06)" },
      { name: "on-obsidian", use: "Text on obsidian" },
      { name: "on-obsidian-2", use: "Small text on obsidian" },
      { name: "on-obsidian-3", use: "List text on obsidian" },
    ],
  },
  {
    title: "Molten metal and surfaces (v2)",
    kind: "gradient",
    tokens: [
      { name: "metal", use: "Primary buttons, fills, coin, ingot" },
      { name: "molten-base", use: "Molten button base under the flowing fill (PD-04)" },
      { name: "molten-flow", use: "Molten button's flowing fill, a 4.5 s loop (PD-04)" },
      { name: "molten-danger-flow", use: "Destructive button's flowing fill (PD-04)" },
      { name: "coin-face", use: "Coin switch knob, M face (PD-05)" },
      { name: "coin-face-on", use: "Coin switch knob, tick face (PD-05)" },
      { name: "slider-coin", use: "Molten slider coin thumb (PD-06)" },
      { name: "mcard-face", use: "Member card face under the metal rim (PD-06)" },
      { name: "liquid-blob", use: "Liquid choice selection (PD-05)" },
      { name: "dock-blob", use: "Dock and rail current-item gold (PD-07)" },
      { name: "scan-halo", use: "Scan coin orbiting light (PD-07)" },
      { name: "phone-frame", use: "/dev/molten demo phone frame (PD-07)" },
      { name: "phone-notch", use: "/dev/molten demo phone notch (PD-07)" },
      { name: "metal-svg-0", use: "Metal gradient stop 0 for SVG fills (heart toggle)" },
      { name: "metal-svg-1", use: "Metal gradient stop .35 for SVG fills" },
      { name: "metal-svg-2", use: "Metal gradient stop .5 for SVG fills; orbit light" },
      { name: "metal-svg-3", use: "Metal gradient stop .7 for SVG fills" },
      { name: "metal-svg-4", use: "Metal gradient stop 1 for SVG fills" },
      { name: "metal-text", use: "Display text shine" },
      { name: "surface-placed", use: "Placed card fill" },
      { name: "edge", use: "Gold hairline border (border-box)" },
    ],
  },
  {
    title: "Molten elevation (v2)",
    kind: "shadow",
    tokens: [
      { name: "inner", use: "White inner bevel" },
      { name: "lift", use: "Placed card shadow" },
      { name: "lift-hover", use: "Placed card hover shadow" },
      { name: "lift-dark", use: "Dark panel bevel and gold outline" },
    ],
  },
  {
    title: "Molten easing (v2)",
    kind: "easing",
    tokens: [
      { name: "ease-io", use: "Moves and loops" },
      { name: "spring", use: "Presses, pills, coins (reference linear() spring)" },
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
      { name: "scan-rise", use: "Raised Scan button above the bottom nav" },
      { name: "dock-bottom", use: "Floating dock gap to the bottom edge (PD-07)" },
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
