/**
 * Tab and Shift+Tab cycle inside an open overlay (P0-09 AC 3). The modal <dialog> already makes the page behind
 * inert; this keeps focus from leaving the dialog for the browser's own UI, so the cycle is the same everywhere.
 */
const CANDIDATES = [
  "a[href]",
  "area[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "iframe",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[tabindex]",
].join(",");

function isTabbable(el: HTMLElement): boolean {
  if (el.tabIndex < 0) return false;
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.closest("[inert],[hidden],fieldset:disabled")) return false;
  // A radio group is one stop: only its checked radio (or the first, when none is checked) takes Tab.
  if (el instanceof HTMLInputElement && el.type === "radio" && el.name && !el.checked) {
    const group = el.form?.elements.namedItem(el.name);
    const radios =
      group instanceof RadioNodeList
        ? [...group]
        : [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)];
    const checked = radios.some((r) => r instanceof HTMLInputElement && r.checked);
    if (checked || radios[0] !== el) return false;
  }
  // checkVisibility is missing in older Safari and in jsdom: treat as visible there.
  return typeof el.checkVisibility === "function" ? el.checkVisibility() : true;
}

export function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(CANDIDATES)].filter(isTabbable);
}

/** Call on a Tab keydown inside `root`; wraps focus at either end (or holds it on `root` when nothing is tabbable). */
export function trapTab(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
  const items = tabbables(root);
  const first = items[0];
  const last = items.at(-1);
  const active = document.activeElement;
  if (!first || !last) {
    event.preventDefault();
    root.focus({ preventScroll: true });
    return;
  }
  const inside = active instanceof HTMLElement && active !== root && root.contains(active);
  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (!inside || active === last) {
    event.preventDefault();
    first.focus();
  }
}
