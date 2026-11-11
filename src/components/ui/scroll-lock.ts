/**
 * Page scroll lock shared by every overlay (P0-09 AC 11). A counter, so stacked overlays can close in any order:
 * the first lock saves the page's inline styles, the last release puts them back. `overflow: hidden` on <html>
 * keeps `scrollY` where it was (no `position: fixed` body trick, so nothing jumps on close); a classic
 * scrollbar's width is padded back so the page does not shift sideways. Overlay content scrolls with
 * `overscroll-behavior: contain`, so its scroll end never chains to the page.
 */
let count = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

export function lockScroll(): () => void {
  const root = document.documentElement;
  if (count === 0) {
    saved = { overflow: root.style.overflow, paddingRight: root.style.paddingRight };
    const scrollbar = root.clientWidth > 0 ? window.innerWidth - root.clientWidth : 0;
    if (scrollbar > 0) {
      const base = Number.parseFloat(getComputedStyle(root).paddingRight) || 0;
      root.style.paddingRight = `${String(base + scrollbar)}px`;
    }
    root.style.overflow = "hidden";
    root.dataset.scrollLocked = "";
  }
  count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count--;
    if (count > 0) return;
    count = 0;
    root.style.overflow = saved?.overflow ?? "";
    root.style.paddingRight = saved?.paddingRight ?? "";
    delete root.dataset.scrollLocked;
    saved = null;
  };
}

/** Test helper. */
export const __scrollLockCount = (): number => count;
