/** Shared by the server page and the client component (a "use client" module can't export plain values to the server). */
export const GUARD_MODES = [
  "ok",
  "console-error",
  "throw",
  "rejection",
  "fetch-500",
  "hydration",
] as const;
export type GuardMode = (typeof GUARD_MODES)[number];
