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
};

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
    status: "pending",
  },
  {
    name: "molten-button",
    title: "Molten button",
    anchor: 'id="collectBtn"',
    task: "PD-04",
    status: "pending",
  },
  {
    name: "orbit-button",
    title: "Orbit button",
    anchor: 'id="fillBtn"',
    task: "PD-04",
    status: "pending",
  },
  {
    name: "ghost-button",
    title: "Ghost button",
    anchor: 'id="resetBtn"',
    task: "PD-04",
    status: "pending",
  },
  {
    name: "heart-toggle",
    title: "Heart toggle",
    anchor: 'id="saveBtn"',
    task: "PD-04",
    status: "pending",
  },
  {
    name: "coin-switch",
    title: "Coin switch",
    anchor: 'aria-labelledby="lt1"',
    task: "PD-05",
    status: "pending",
  },
  {
    name: "liquid-choice",
    title: "Liquid choice",
    anchor: 'id="rewardPick"',
    task: "PD-05",
    status: "pending",
  },
  {
    name: "seal-checkbox",
    title: "Seal checkbox",
    anchor: '<span class="box"',
    task: "PD-05",
    status: "pending",
  },
  { name: "tabs", title: "Tabs", anchor: 'id="seg"', task: "PD-06", status: "pending" },
  { name: "stars", title: "Star rating", anchor: 'id="stars"', task: "PD-06", status: "pending" },
  { name: "slider", title: "Slider", anchor: 'id="slider"', task: "PD-06", status: "pending" },
  {
    name: "text-field",
    title: "Text field",
    anchor: 'id="field"',
    task: "PD-06",
    status: "pending",
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
