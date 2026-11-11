import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { CookieNotice } from "@/features/consent/CookieNotice";
import { ApplyPreferences } from "@/features/preferences/ApplyPreferences";
import { loadAccountPreferences } from "@/features/preferences/load";
import { clientEnv } from "@/lib/env";
import { HEAD_SCRIPT } from "@/lib/head-script";
import { fraunces, manrope } from "@/styles/fonts";
import { colourTokens } from "@/styles/tokens";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Moz Rewards", template: "%s · Moz Rewards" },
  description: "Collect gold with every visit.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: colourTokens.bg,
};

/** Streams in after the shell: the profile lookup never delays first paint. */
async function AccountPreferences(): Promise<React.JSX.Element> {
  return <ApplyPreferences account={await loadAccountPreferences()} />;
}

export default async function RootLayout({
  children,
}: LayoutProps<"/">): Promise<React.JSX.Element> {
  // Render per request so Next can put this request's CSP nonce (set by src/proxy.ts) on every script.
  await connection();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // suppressHydrationWarning: the pre-paint script sets data-reduce-motion on <html> before React hydrates.
    <html
      lang="en-GB"
      className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Stored motion choice onto <html> before first paint (P0-08 AC 7). Our own constant; nonce from proxy.ts. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          // eslint-disable-next-line react/no-danger -- a constant from our own module, no request data
          dangerouslySetInnerHTML={{ __html: HEAD_SCRIPT }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="bg-surface shadow-2 sr-only rounded-md px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to content
        </a>
        <Suspense fallback={null}>
          <AccountPreferences />
        </Suspense>
        {children}
        {clientEnv.NEXT_PUBLIC_UMAMI_PATH && clientEnv.NEXT_PUBLIC_UMAMI_WEBSITE_ID ? (
          <CookieNotice
            path={clientEnv.NEXT_PUBLIC_UMAMI_PATH}
            websiteId={clientEnv.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
          />
        ) : null}
      </body>
    </html>
  );
}
