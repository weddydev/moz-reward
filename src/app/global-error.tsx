"use client";

import { RouteError } from "@/features/portal/RouteError";
import { fraunces, manrope } from "@/styles/fonts";
import "./globals.css";

/**
 * An error in the root layout itself: this replaces the whole document, so it brings its own `<html>`,
 * styles and fonts. Same generic page as every other error (never the error's own text).
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}): React.JSX.Element {
  return (
    <html lang="en-GB" className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <title>Something went wrong · Moz Rewards</title>
        <RouteError as="main" error={error} retry={retry} />
      </body>
    </html>
  );
}
