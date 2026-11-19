/**
 * Card → page morph across a loading state (P1-07). A shared-element pair only forms when both ends are on
 * screen in the same commit, but a dynamic page under `loading.tsx` commits its fallback first (always once
 * the link's loading shell is prefetched), so the card has nothing to morph into. `TransitionLink` records the
 * tapped card's identity here (only what the card already shows); the destination's loading state reads it and
 * draws the real header (`SharedElement` pair) while the rest loads, and the arriving page puts the same
 * header in the same place. Same rules as `nav-intent`: same-origin, one path, short-lived, module state (one
 * document, one navigation at a time). Not consumed on read: React may render a fallback more than once.
 */
export type Hero = { id: string; name: string; imageUrl: string | null };

export const HERO_TTL_MS = 5000;

let hero: { path: string; hero: Hero; at: number } | null = null;

export function setHero(
  href: string,
  value: Hero,
  now = Date.now(),
  base = window.location.href,
): void {
  try {
    const url = new URL(href, base);
    hero =
      url.origin === new URL(base).origin ? { path: url.pathname, hero: value, at: now } : null;
  } catch {
    hero = null;
  }
}

/** The tapped card's identity if the last recorded click pointed at `pathname` and is recent. */
export function peekHero(pathname: string, now = Date.now()): Hero | null {
  if (!hero || hero.path !== pathname || now - hero.at > HERO_TTL_MS) return null;
  return hero.hero;
}

export function clearHero(): void {
  hero = null;
}
