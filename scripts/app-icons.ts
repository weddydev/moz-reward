/**
 * Draws the app icons (P1-14 manifest; P5-02 adds maskable and Apple touch variants): a gold coin with an
 * engraved "M" on the pearl ground, colours from tokens.css (the Gilded Gate coin). Full-bleed square, the coin
 * inside the central 80% so a maskable crop never cuts it. Run `pnpm tsx scripts/app-icons.ts` after a change
 * and commit the PNGs in public/icons; nothing runs this at build time.
 */
import { chromium } from "@playwright/test";

const SIZES = [192, 512] as const;

export function iconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="coin" cx="38%" cy="32%" r="75%">
      <stop offset="0" stop-color="#fff1bf"/>
      <stop offset=".45" stop-color="#f2c14e"/>
      <stop offset="1" stop-color="#c8922c"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f5cf6b"/>
      <stop offset="1" stop-color="#7c5510"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="#fffcf5"/>
  <circle cx="50" cy="50" r="31" fill="url(#rim)"/>
  <circle cx="50" cy="50" r="28" fill="url(#coin)"/>
  <circle cx="50" cy="50" r="24.5" fill="none" stroke="#c8922c" stroke-width=".8" opacity=".7"/>
  <path d="M36 63V37h4.6l9.4 14.2L59.4 37H64v26h-5V46.4l-8.2 12.1h-1.6L41 46.4V63z" fill="#5c3d0a"/>
</svg>`;
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const size of SIZES) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(
        `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${iconSvg()}`,
      );
      await page.screenshot({ path: `public/icons/icon-${size}.png`, omitBackground: false });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith("app-icons.ts")) void main();
