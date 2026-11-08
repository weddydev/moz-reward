/** Joins class names, skipping falsy values. (No merge magic: components expose variants instead.) */
export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");
