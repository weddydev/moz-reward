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
