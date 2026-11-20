import { type Locator } from "./molten-reference";

/**
 * DESIGN §7.4 (the Molten motion spec) as data (PD-01). Each value says where it lives in the reference
 * (`design/reference/molten/index.html`) and, once its row is `required`, where it lives in production.
 * `molten-spec.test.ts` proves every value equals the reference (so DESIGN quotes it correctly) and, for
 * required rows, equals production. Rows start `pending`; the PD task named in `task` flips its rows to
 * `required` (and adds `prod`); a required row never goes back (`molten-spec.lock.json`).
 */

/** Where production keeps a value: a CSS rule in a file under `src/`, or a value read from TypeScript. */
export type ProdLocator =
  { file: string; css: string; prop: string; part?: string } | { value: () => string | number };

export type SpecValue = {
  /** What the value is, in DESIGN's words. */
  name: string;
  /** The value as DESIGN §7.4 quotes it (reference variable names allowed, e.g. `.45s var(--spring)`). */
  value: string;
  ref: Locator;
  prod?: ProdLocator;
};

export type SpecRow = {
  id: string;
  element: string;
  task: `PD-${string}`;
  status: "pending" | "required";
  /** Rows whose values live in DESIGN §7.3 / §8 are filled by their task; until then they hold none. */
  values: readonly SpecValue[];
};

const css = (selector: string, prop: string, part?: string): Locator =>
  part === undefined ? { css: selector, prop } : { css: selector, prop, part };
const js = (anchor: string, pattern: RegExp, nth = 0): Locator => ({ js: anchor, pattern, nth });
const page = (anchor: string, pattern: RegExp, nth = 0): Locator => ({
  js: anchor,
  pattern,
  nth,
  in: "page",
});

export const MOLTEN_SPEC: readonly SpecRow[] = [
  {
    id: "molten-button",
    element: "Molten button",
    task: "PD-04",
    status: "pending",
    values: [
      {
        name: "press transform",
        value: ".45s var(--spring)",
        ref: css(".btn", "transition", "transform"),
      },
      { name: "press scale", value: ".93", ref: css(".btn.down", "--s") },
      { name: "ripple", value: "720", ref: js("function ripple", /duration: (\d+)/g) },
      {
        name: "label roll",
        value: ".5s var(--spring)",
        ref: css(".btn .lbl > span", "transition", "transform"),
      },
      { name: "label back after", value: "1700", ref: js("function rollLabel", /ms = (\d+)/g) },
      {
        name: "fill flow loop",
        value: "4.5s linear infinite",
        ref: css(".btn-molten::before", "animation", "flow"),
      },
      {
        name: "sparks",
        value: "28",
        ref: js("function celebrate", /type: 'spark', count: (\d+)/g),
      },
      { name: "coins", value: "6", ref: js("function celebrate", /coins = (\d+)/g) },
    ],
  },
  {
    id: "orbit-button",
    element: "Orbit button",
    task: "PD-04",
    status: "pending",
    values: [
      {
        name: "orbit loop",
        value: "3.4s linear infinite",
        ref: css(".btn-orbit", "animation", "orbit"),
      },
      {
        name: "orbit loop on hover",
        value: "1.1s",
        ref: css(".btn-orbit:hover", "animation-duration"),
      },
    ],
  },
  {
    id: "ghost-button",
    element: "Ghost button",
    task: "PD-04",
    status: "pending",
    values: [
      {
        name: "underline",
        value: ".5s var(--spring)",
        ref: css(".btn-ghost .u::after", "transition", "transform"),
      },
    ],
  },
  {
    id: "heart-toggle",
    element: "Heart toggle",
    task: "PD-04",
    status: "pending",
    values: [
      { name: "pop", value: "620", ref: js("$('#saveBtn')", /duration: (\d+)/g, 0) },
      {
        name: "pop overshoot offset",
        value: ".45",
        ref: js("$('#saveBtn')", /offset: ([.\d]+)/g, 0),
      },
      { name: "ring", value: "600", ref: js("$('#saveBtn')", /duration: (\d+)/g, 1) },
      { name: "dots", value: "650", ref: js("$('#saveBtn')", /duration: (\d+)/g, 2) },
    ],
  },
  {
    id: "coin-switch",
    element: "Coin switch",
    task: "PD-05",
    status: "pending",
    values: [
      {
        name: "coin",
        value: ".7s var(--spring)",
        ref: css(".tgl-coin", "transition", "transform"),
      },
      {
        name: "face flip",
        value: ".5s var(--ease-out) .18s",
        ref: css(".coin-in", "transition", "transform"),
      },
      {
        name: "fill",
        value: ".6s var(--ease-out)",
        ref: css(".tgl-fill", "transition", "transform"),
      },
      { name: "spark and pulse at", value: "420", ref: js("coin toggles", /RM \? 0 : (\d+)/g) },
      { name: "sparks", value: "16", ref: js("coin toggles", /count: (\d+)/g) },
    ],
  },
  {
    id: "liquid-choice",
    element: "Liquid choice",
    task: "PD-05",
    status: "pending",
    values: [
      { name: "blob", value: "660", ref: js("function select(", /duration: (\d+)/g, 0) },
      {
        name: "blob stretch offset",
        value: ".42",
        ref: js("function select(", /offset: ([.\d]+)/g, 0),
      },
      { name: "droplets", value: "760", ref: js("function select(", /duration: (\d+)/g, 1) },
      { name: "first droplet delay", value: "90", ref: js("function select(", /delay: (\d+)/g, 0) },
      { name: "sparks at", value: "520", ref: js("liquid(rp", /\}\), (\d+)\)/g) },
      { name: "goo blur", value: "7", ref: page('<filter id="goo"', /stdDeviation="(\d+)"/g) },
    ],
  },
  {
    id: "seal-checkbox",
    element: "Seal checkbox",
    task: "PD-05",
    status: "pending",
    values: [
      { name: "box", value: "480", ref: js("transform: 'scale(.72)'", /duration: (\d+)/g) },
      {
        name: "flood",
        value: ".38s var(--ease-out)",
        ref: css(".box::before", "transition", "clip-path"),
      },
      {
        name: "tick",
        value: ".3s var(--ease-out)",
        ref: css(".box svg", "transition", "stroke-dashoffset"),
      },
      {
        name: "ring",
        value: ".6s var(--ease-out)",
        ref: css(".box.burst::after", "animation", "ring"),
      },
      { name: "sparks at", value: "120", ref: js("speed: [90, 240]", /\}\), (\d+)\)/g) },
    ],
  },
  {
    id: "tabs",
    element: "Tabs",
    task: "PD-06",
    status: "pending",
    values: [
      {
        name: "pill",
        value: ".6s var(--spring)",
        ref: css(".seg-ind,.seg-trail", "transition", "transform"),
      },
      { name: "panel slide", value: "380", ref: js("function go(", /duration: (\d+)/g) },
      {
        name: "count-up",
        value: "650",
        ref: js("function go(", /countUp\(big, \+big\.dataset\.n, (\d+)\)/g),
      },
    ],
  },
  {
    id: "stars",
    element: "Stars",
    task: "PD-06",
    status: "pending",
    values: [
      { name: "star pop", value: "480", ref: js("stars.slice(0, val)", /duration: (\d+)/g) },
      { name: "sparks per star", value: "7", ref: js("stars.slice(0, val)", /count: (\d+)/g) },
      { name: "label", value: "300", ref: js("stars.slice(0, val)", /duration: (\d+)/g, 1) },
      { name: "stagger", value: "70", ref: js("stars.slice(0, val)", /delay: val \* (\d+)/g) },
      {
        name: "the two choices",
        value: ".5s var(--spring) both",
        ref: css(".rate-actions.show button", "animation", "pop"),
      },
    ],
  },
  {
    id: "slider",
    element: "Slider",
    task: "PD-06",
    status: "pending",
    values: [
      {
        name: "bubble tilt limit (deg)",
        value: "28",
        ref: js("--tilt', clamp(", /clamp\(-(\d+),/g),
      },
      {
        name: "bubble spring back",
        value: ".5s var(--spring)",
        ref: css(".bubble", "transition", "transform"),
      },
      {
        name: "glint loop",
        value: "2.4s var(--ease-io) infinite",
        ref: css(".sl-fill::after", "animation", "glint"),
      },
    ],
  },
  {
    id: "text-field",
    element: "Text field",
    task: "PD-06",
    status: "pending",
    values: [
      { name: "beam", value: ".55s var(--ease-out)", ref: css(".beam", "transition", "transform") },
      {
        name: "label",
        value: ".35s var(--spring)",
        ref: css(".field label", "transition", "transform"),
      },
      { name: "shake", value: "420", ref: js("anim(field", /duration: (\d+)/g) },
      {
        name: "tick",
        value: ".4s var(--ease-out)",
        ref: css(".field .okmark", "transition", "stroke-dashoffset"),
      },
    ],
  },
  {
    id: "member-card",
    element: "Member card",
    task: "PD-06",
    status: "pending",
    values: [
      {
        name: "tracking",
        value: ".12s linear",
        ref: css(".mcard.live", "transition", "transform"),
      },
      {
        name: "spring back and flip",
        value: ".7s var(--spring)",
        ref: css(".mcard", "transition", "transform"),
      },
      {
        name: "idle sway",
        value: "7s var(--ease-io) infinite alternate",
        ref: css(".mcard.idle", "animation", "sway"),
      },
    ],
  },
  {
    id: "toast",
    element: "Toast",
    task: "PD-04",
    status: "pending",
    values: [
      { name: "in", value: "520", ref: js("function toast", /duration: (\d+)/g, 0) },
      { name: "in easing", value: "SPRING", ref: js("function toast", /easing: (\w+)/g, 0) },
      { name: "coin spin", value: "800", ref: js("function toast", /duration: (\d+)/g, 1) },
      { name: "progress", value: "3600", ref: js("function toast", /duration: (\d+)/g, 2) },
      { name: "out", value: "260", ref: js("function toast", /duration: (\d+)/g, 3) },
    ],
  },
  {
    id: "placed-card",
    element: "Placed card",
    task: "PD-02",
    status: "required",
    values: [
      {
        name: "lift",
        value: ".5s var(--spring)",
        ref: css(".pr,.pcard", "transition", "translate"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-placed",
          prop: "transition",
          part: "translate",
        },
      },
      {
        name: "shadow",
        value: ".4s var(--ease-out)",
        ref: css(".pr,.pcard", "transition", "box-shadow"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-placed",
          prop: "transition",
          part: "box-shadow",
        },
      },
    ],
  },
  {
    id: "gilded-edge",
    element: "Gilded edge",
    task: "PD-02",
    status: "required",
    values: [
      {
        name: "seam light cycle",
        value: "8s infinite",
        ref: css(".sm-shine", "animation", "seamshine"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-seam .sm-shine",
          prop: "animation",
          part: "m-seamshine",
        },
      },
      {
        name: "gem glint cycle",
        value: "8s infinite",
        ref: css(".sm-glint", "animation", "gemglint"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-seam .sm-glint",
          prop: "animation",
          part: "m-gemglint",
        },
      },
    ],
  },
  {
    id: "living-background",
    element: "Living background",
    task: "PD-02",
    status: "required",
    values: [
      {
        name: "glow 1",
        value: "26s var(--ease-io) infinite alternate",
        ref: css(".aurora i:nth-child(1)", "animation", "d1"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-aurora i:nth-child(1)",
          prop: "animation",
          part: "m-d1",
        },
      },
      {
        name: "glow 2",
        value: "32s var(--ease-io) infinite alternate",
        ref: css(".aurora i:nth-child(2)", "animation", "d2"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-aurora i:nth-child(2)",
          prop: "animation",
          part: "m-d2",
        },
      },
      {
        name: "glow 3",
        value: "38s var(--ease-io) infinite alternate",
        ref: css(".aurora i:nth-child(3)", "animation", "d3"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-aurora i:nth-child(3)",
          prop: "animation",
          part: "m-d3",
        },
      },
    ],
  },
  {
    id: "dock",
    element: "Dock",
    task: "PD-07",
    status: "pending",
    values: [
      {
        name: "icon lift",
        value: ".45s var(--spring)",
        ref: css(".dk svg", "transition", "transform"),
      },
      {
        name: "Scan halo",
        value: "2.6s linear infinite",
        ref: css(".scan::before", "animation", "spin"),
      },
      {
        name: "Scan radar",
        value: "2.4s var(--ease-out) infinite",
        ref: css(".scan::after", "animation", "radar"),
      },
    ],
  },
  {
    id: "wallet-stack",
    element: "Wallet stack",
    task: "PD-08",
    status: "pending",
    values: [
      {
        name: "fan-out",
        value: ".6s var(--spring)",
        ref: css(".wcard", "transition", "transform"),
      },
      {
        name: "fan-out offset (24 px × index)",
        value: "translateY(calc(var(--i) * 24px))",
        ref: css(".stack:hover .wcard", "transform"),
      },
      {
        name: "shine loop",
        value: "5s var(--ease-io) infinite",
        ref: css(".wcard::after", "animation", "cardshine"),
      },
    ],
  },
  { id: "card-to-shop", element: "Card → shop", task: "PD-08", status: "pending", values: [] },
  { id: "gilded-gate", element: "Gilded Gate 2.0", task: "PD-09", status: "pending", values: [] },
  {
    id: "vault",
    element: "Vault pour / reward / redeem",
    task: "PD-10",
    status: "pending",
    values: [],
  },
  {
    id: "fx-engine",
    element: "FX engine",
    task: "PD-03",
    status: "pending",
    values: [
      { name: "particle cap, lite", value: "160", ref: js("const MAX = lite", /lite \? (\d+)/g) },
      {
        name: "particle cap, full",
        value: "420",
        ref: js("const MAX = lite", /lite \? \d+ : (\d+)/g),
      },
      {
        name: "canvas DPR cap",
        value: "2",
        ref: js("function size()", /Math\.min\((\d+), devicePixelRatio/g),
      },
      { name: "spark gravity", value: "520", ref: js("o.gravity ??", /'spark' \? (\d+)/g) },
      { name: "coin gravity", value: "1100", ref: js("o.gravity ??", /'coin' \? (\d+)/g) },
      { name: "leaf gravity", value: "60", ref: js("o.gravity ??", /'coin' \? \d+ : (\d+)/g) },
      { name: "drag", value: ".975", ref: js("drag: type === 'leaf'", /\.985 : (\.\d+)/g) },
      {
        name: "leaf drag",
        value: ".985",
        ref: js("drag: type === 'leaf'", /'leaf' \? (\.\d+)/g),
      },
      {
        name: "spark life (s)",
        value: ".45, .9",
        ref: js("const life = rnd(", /\[1\.1, 1\.7\] : \[([.\d]+, [.\d]+)\]/g),
      },
      {
        name: "coin life (s)",
        value: "1.1, 1.7",
        ref: js("const life = rnd(", /'coin' \? \[([.\d]+, [.\d]+)\]/g),
      },
      {
        name: "leaf life (s)",
        value: "2.2, 3.4",
        ref: js("const life = rnd(", /'leaf' \? \[([.\d]+, [.\d]+)\]/g),
      },
    ],
  },
];
