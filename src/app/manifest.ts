import { colourTokens } from "@/styles/tokens";
import type { MetadataRoute } from "next";

/**
 * The web app manifest (P1-14 skeleton; P5-02 completes it with maskable icons, screenshots and the Apple touch
 * icon). Enough for Chromium installability and iOS Add to Home Screen. Colours come from the tokens.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Moz Rewards",
    short_name: "Moz Rewards",
    description: "Collect gold with every visit.",
    lang: "en-GB",
    start_url: "/wallet",
    scope: "/",
    display: "standalone",
    background_color: colourTokens.pearl,
    theme_color: colourTokens.pearl,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
