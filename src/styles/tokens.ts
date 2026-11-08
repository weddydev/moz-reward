/**
 * The few token values needed as literal colours outside CSS (the `<meta name="theme-color">` and the TOTP
 * QR code can't use CSS variables). `tokens.css` stays the source of truth: `tokens.test.ts` fails if these drift.
 */
export const colourTokens = {
  bg: "#fbf8f1",
  surface: "#ffffff",
  ink: "#1c1a17",
} as const;
