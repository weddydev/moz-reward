/**
 * The parts of the Molten reference the parity harness compares (PD-01), shared by `/dev/molten`, the
 * reference-copy generator (`pnpm parity:reference`) and `tests/parity/*.spec.ts`.
 * - `anchor`: an exact substring of the element's opening tag in the frozen reference; the generator adds
 *   `data-parity="<name>"` to that element in the copy (never to the original).
 * - `status`: `pending` until the named PD task builds it on `/dev/molten` from production components; then
 *   `required`, and the static and frame parity specs compare it. A required part never goes back.
 */
export type ParityPart = {
  name: string;
  title: string;
  anchor: string;
  task: `PD-${string}`;
  status: "pending" | "required";
  /**
   * Compared on a plain white backdrop (its parent's background set to white on both pages): for a part whose
   * surroundings are built by a later task (the vault's orbit and ghost buttons until PD-10), so only the part
   * itself is judged, never the stand-in around it.
   */
  isolate?: true;
  /**
   * Compared at its own content height on both pages (`align-self: start`): for a grid tile whose row-mate is
   * built by a later task, which stretches the row (the Buttons tile until PD-05 built its Coin switch neighbour).
   */
  ownHeight?: true;
  /**
   * Compared over a blank white page (everything else hidden): for a fixed overlay whose see-through frames would
   * otherwise show each page's own content behind it (the toast while it fades in and out).
   */
  alone?: true;
  /**
   * A documented per-browser allowance above the harness limit (DECISIONS line required): for a difference that
   * comes from the reference itself, not from the app (PD phase rule "Port, don't reinvent").
   */
  tolerance?: { browser: "chromium" | "webkit" | "all"; max: number; why: string };
};

/** The diff limit for `part` in `browser`: the harness limit, or the part's documented tolerance. */
export function parityLimit(part: ParityPart, browser: string, harness: number): number {
  const t = part.tolerance;
  return t && (t.browser === "all" || t.browser === browser) ? Math.max(harness, t.max) : harness;
}

export const PARITY_PARTS: readonly ParityPart[] = [
  {
    name: "intro",
    title: "Gilded Gate intro",
    anchor: 'id="intro"',
    task: "PD-09",
    status: "pending",
  },
  {
    name: "language",
    title: "Design language",
    anchor: 'id="language"',
    task: "PD-02",
    status: "required",
  },
  {
    name: "molten-button",
    title: "Molten button",
    anchor: 'id="collectBtn"',
    task: "PD-04",
    status: "required",
  },
  {
    name: "orbit-button",
    title: "Orbit button",
    anchor: 'id="fillBtn"',
    task: "PD-04",
    status: "required",
    isolate: true,
  },
  {
    name: "ghost-button",
    title: "Ghost button",
    anchor: 'id="resetBtn"',
    task: "PD-04",
    status: "required",
    isolate: true,
  },
  {
    name: "heart-toggle",
    title: "Heart toggle",
    anchor: 'id="saveBtn"',
    task: "PD-04",
    status: "required",
    tolerance: {
      browser: "webkit",
      max: 0.03,
      why: "the reference's .ico-btn keeps WebKit's default button padding (2px top, 3px bottom), so its heart sits 0.5px higher in WebKit only (DECISIONS 22 Nov)",
    },
  },
  {
    name: "tile",
    title: "Buttons tile (placed tile surface, C-75)",
    anchor: '<article class="tile w7"',
    task: "PD-04",
    status: "required",
  },
  {
    name: "toast",
    title: "Toast",
    anchor: 'id="toasts"',
    task: "PD-04",
    status: "required",
    alone: true,
  },
  // Tiles that share an opening tag are found in this order: each hook added to the copy changes its tag, so the
  // next part with the same anchor finds the next tile (the Liquid choice tile, then the Gold seal tile; the
  // first box, then the second).
  {
    name: "coin-switch-tile",
    title: "Coin switch tile",
    anchor: '<article class="tile w5"',
    task: "PD-05",
    status: "required",
  },
  {
    name: "coin-switch",
    title: "Coin switch",
    anchor: 'aria-labelledby="lt1"',
    task: "PD-05",
    status: "required",
  },
  {
    name: "liquid-choice-tile",
    title: "Liquid choice tile",
    anchor: '<article class="tile w6"',
    task: "PD-05",
    status: "required",
  },
  {
    name: "liquid-choice",
    title: "Liquid choice",
    anchor: 'id="rewardPick"',
    task: "PD-05",
    status: "required",
    tolerance: {
      browser: "all",
      max: 0.015,
      why: "the options' second line is ink-2, not the reference's ink-3, which is below AA contrast at 11.5 px (DECISIONS 22 Nov \"PD-05 secondary text\"); measured 1.14% at 390 in Chromium",
    },
  },
  {
    name: "seal-checkbox-tile",
    title: "Gold seal checkbox tile",
    anchor: '<article class="tile w6"',
    task: "PD-05",
    status: "required",
  },
  {
    name: "seal-checkbox",
    title: "Seal checkbox (unticking)",
    anchor: '<span class="box"',
    task: "PD-05",
    status: "required",
  },
  {
    name: "seal-checkbox-on",
    title: "Seal checkbox (ticking)",
    anchor: '<span class="box"',
    task: "PD-05",
    status: "required",
  },
  {
    name: "tabs-tile",
    title: "Tabs tile",
    anchor: '<article class="tile w4"',
    task: "PD-06",
    status: "required",
  },
  { name: "tabs", title: "Tabs", anchor: 'id="seg"', task: "PD-06", status: "required" },
  {
    name: "stars-tile",
    title: "Rate your visit tile",
    anchor: '<article class="tile w4"',
    task: "PD-06",
    status: "required",
  },
  { name: "stars", title: "Star rating", anchor: 'id="stars"', task: "PD-06", status: "required" },
  {
    name: "slider-tile",
    title: "Molten slider tile",
    anchor: '<article class="tile w4"',
    task: "PD-06",
    status: "required",
  },
  { name: "slider", title: "Slider", anchor: 'id="slider"', task: "PD-06", status: "required" },
  {
    name: "text-field-tile",
    title: "Input tile",
    anchor: '<article class="tile w5"',
    task: "PD-06",
    status: "required",
    // Until PD-06 builds its row-mate (Member card), which sets the row's height.
    ownHeight: true,
  },
  {
    name: "text-field",
    title: "Text field",
    anchor: 'id="field"',
    task: "PD-06",
    status: "required",
    tolerance: {
      browser: "all",
      max: 0.03,
      why: 'the resting label is ink-2, not the reference\'s ink-3, which is below AA at 16 px (DECISIONS 22 Nov "PD-05 secondary text"); measured 1.2-1.8% static, 2.6% at the first frame (390, both engines)',
    },
  },
  {
    name: "member-card",
    title: "Member card",
    anchor: 'id="mcard"',
    task: "PD-06",
    status: "pending",
  },
  { name: "dock", title: "Floating dock", anchor: 'id="dock"', task: "PD-07", status: "pending" },
  {
    name: "wallet-stack",
    title: "Wallet stack",
    anchor: 'id="stack"',
    task: "PD-08",
    status: "pending",
  },
  { name: "shop", title: "Shop page", anchor: 'id="vShop"', task: "PD-08", status: "pending" },
  { name: "vault", title: "Gold Vault", anchor: 'id="vault"', task: "PD-10", status: "pending" },
  {
    name: "reward",
    title: "Reward unlocked",
    anchor: 'id="reward"',
    task: "PD-10",
    status: "pending",
  },
];

/** Adds `data-parity` to each part's element in the reference HTML; throws if an anchor is missing or ambiguous
 *  (the first match must be the element; a second match elsewhere is allowed only for class anchors). */
export function addParityHooks(html: string, parts: readonly ParityPart[] = PARITY_PARTS): string {
  let out = html;
  for (const part of parts) {
    const at = out.indexOf(part.anchor);
    if (at < 0) throw new Error(`parity anchor not found: ${part.name} (${part.anchor})`);
    const open = part.anchor.startsWith("<") ? at : out.lastIndexOf("<", at);
    const nameEnd = out.slice(open + 1).search(/[\s>]/) + open + 1;
    if (out.slice(open, at).includes(">"))
      throw new Error(`parity anchor is not in an opening tag: ${part.name}`);
    out = `${out.slice(0, nameEnd)} data-parity="${part.name}"${out.slice(nameEnd)}`;
  }
  return out;
}

/** The reference's Google Fonts links, replaced in the copy by the app's own `@font-face` rules (`fonts.css`). */
export function withAppFonts(html: string): string {
  const links =
    /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/;
  if (!links.test(html))
    throw new Error("the reference's Google Fonts links changed: update withAppFonts");
  return html.replace(links, '<link rel="stylesheet" href="fonts.css">');
}
