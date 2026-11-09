// Control characters are stripped by the URL parser, so they could hide a different target; refuse them.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
/** Encoded slash or backslash: some routers and proxies decode these into a path separator. */
const ENCODED_SEPARATOR = /%2f|%5c/i;

/** Allowlisted internal return paths only (SECURITY.md §4): must be a same-origin path. */
export function safeReturnTo(value: string | null | undefined, fallback = "/wallet"): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARS.test(value)
  )
    return fallback;
  try {
    const base = "http://internal.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    // Check the *normalised* path: "/.//evil.example" resolves to "//evil.example", which a client-side
    // router.push treats as protocol-relative and leaves the site (audit security #3).
    if (url.pathname.startsWith("//") || ENCODED_SEPARATOR.test(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
