import { connection } from "next/server";
import { ApplyPreferences } from "@/components/system/ApplyPreferences";
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

export default async function RootLayout({
  children,
}: LayoutProps<"/">): Promise<React.JSX.Element> {
  // Render per request so Next can put this request's CSP nonce (set by src/proxy.ts) on every script.
  await connection();
  return (
    <html lang="en-GB" className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="bg-surface shadow-2 sr-only rounded-md px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to content
        </a>
        <ApplyPreferences />
        {children}
      </body>
    </html>
  );
}
