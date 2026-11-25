import { RM_MAX_MS } from "./anim";
import {
  BUTTON,
  DOCK,
  FIELD,
  HEART,
  LIQUID,
  MEMBER_CARD,
  SEAL,
  SLIDER,
  STARS,
  SWITCH,
  TABS,
  TOAST,
} from "./controls";
import { FX } from "./fx";
import { POUR } from "./ingot";
import { type Locator } from "./molten-reference";
import { PRESS } from "./press";
import { VAULT } from "./vault";
import { WIPE } from "./wipe";

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

const MOLTEN_CSS = "src/styles/molten.css";
const INGOT_CSS = "src/components/motion/ingot-pour.css";

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
    status: "required",
    values: [
      {
        name: "press transform",
        value: ".45s var(--spring)",
        ref: css(".btn", "transition", "transform"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-btn",
          prop: "transition",
          part: "transform",
        },
      },
      {
        name: "press scale",
        value: ".93",
        ref: css(".btn.down", "--s"),
        prod: { file: "src/styles/molten.css", css: ".m-btn.down", prop: "--s" },
      },
      {
        name: "ripple",
        value: "720",
        ref: js("function ripple", /duration: (\d+)/g),
        prod: { value: () => PRESS.rippleMs },
      },
      {
        name: "label roll",
        value: ".5s var(--spring)",
        ref: css(".btn .lbl > span", "transition", "transform"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-btn .m-lbl > span",
          prop: "transition",
          part: "transform",
        },
      },
      {
        name: "label back after",
        value: "1700",
        ref: js("function rollLabel", /ms = (\d+)/g),
        prod: { value: () => BUTTON.labelBackMs },
      },
      {
        name: "fill flow loop",
        value: "4.5s linear infinite",
        ref: css(".btn-molten::before", "animation", "flow"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-btn-molten::before",
          prop: "animation",
          part: "m-flow",
        },
      },
      {
        name: "sparks",
        value: "28",
        ref: js("function celebrate", /type: 'spark', count: (\d+)/g),
        prod: { value: () => PRESS.celebrate.sparks },
      },
      {
        name: "coins",
        value: "6",
        ref: js("function celebrate", /coins = (\d+)/g),
        prod: { value: () => PRESS.celebrate.coins },
      },
    ],
  },
  {
    id: "orbit-button",
    element: "Orbit button",
    task: "PD-04",
    status: "required",
    values: [
      {
        name: "orbit loop",
        value: "3.4s linear infinite",
        ref: css(".btn-orbit", "animation", "orbit"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-btn-orbit",
          prop: "animation",
          part: "m-orbit",
        },
      },
      {
        name: "orbit loop on hover",
        value: "1.1s",
        ref: css(".btn-orbit:hover", "animation-duration"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-btn-orbit:hover",
          prop: "animation-duration",
        },
      },
    ],
  },
  {
    id: "ghost-button",
    element: "Ghost button",
    task: "PD-04",
    status: "required",
    values: [
      {
        name: "underline",
        value: ".5s var(--spring)",
        ref: css(".btn-ghost .u::after", "transition", "transform"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-btn-ghost .u::after",
          prop: "transition",
          part: "transform",
        },
      },
    ],
  },
  {
    id: "heart-toggle",
    element: "Heart toggle",
    task: "PD-04",
    status: "required",
    values: [
      {
        name: "pop",
        value: "620",
        ref: js("$('#saveBtn')", /duration: (\d+)/g, 0),
        prod: { value: () => HEART.popMs },
      },
      {
        name: "pop overshoot offset",
        value: ".45",
        ref: js("$('#saveBtn')", /offset: ([.\d]+)/g, 0),
        prod: { value: () => HEART.popOvershoot },
      },
      {
        name: "ring",
        value: "600",
        ref: js("$('#saveBtn')", /duration: (\d+)/g, 1),
        prod: { value: () => HEART.ringMs },
      },
      {
        name: "dots",
        value: "650",
        ref: js("$('#saveBtn')", /duration: (\d+)/g, 2),
        prod: { value: () => HEART.dotsMs },
      },
    ],
  },
  {
    id: "coin-switch",
    element: "Coin switch",
    task: "PD-05",
    status: "required",
    values: [
      {
        name: "coin",
        value: ".7s var(--spring)",
        ref: css(".tgl-coin", "transition", "transform"),
        prod: { file: MOLTEN_CSS, css: ".m-tgl-coin", prop: "transition", part: "transform" },
      },
      {
        name: "face flip",
        value: ".5s var(--ease-out) .18s",
        ref: css(".coin-in", "transition", "transform"),
        prod: { file: MOLTEN_CSS, css: ".m-coin-in", prop: "transition", part: "transform" },
      },
      {
        name: "fill",
        value: ".6s var(--ease-out)",
        ref: css(".tgl-fill", "transition", "transform"),
        prod: { file: MOLTEN_CSS, css: ".m-tgl-fill", prop: "transition", part: "transform" },
      },
      {
        name: "spark and pulse at",
        value: "420",
        ref: js("coin toggles", /RM \? 0 : (\d+)/g),
        prod: { value: () => SWITCH.landMs },
      },
      {
        name: "sparks",
        value: "16",
        ref: js("coin toggles", /count: (\d+)/g),
        prod: { value: () => SWITCH.sparks },
      },
    ],
  },
  {
    id: "liquid-choice",
    element: "Liquid choice",
    task: "PD-05",
    status: "required",
    values: [
      {
        name: "blob",
        value: "660",
        ref: js("function select(", /duration: (\d+)/g, 0),
        prod: { value: () => LIQUID.blobMs },
      },
      {
        name: "blob stretch offset",
        value: ".42",
        ref: js("function select(", /offset: ([.\d]+)/g, 0),
        prod: { value: () => LIQUID.stretchAt },
      },
      {
        name: "blob overshoot offset",
        value: ".76",
        ref: js("function select(", /offset: ([.\d]+)/g, 1),
        prod: { value: () => LIQUID.overshootAt },
      },
      {
        name: "droplets",
        value: "760",
        ref: js("function select(", /duration: (\d+)/g, 1),
        prod: { value: () => LIQUID.dropsMs },
      },
      {
        name: "first droplet delay",
        value: "90",
        ref: js("function select(", /delay: (\d+)/g, 0),
        prod: { value: () => LIQUID.dropDelayMs },
      },
      {
        name: "sparks at",
        value: "520",
        ref: js("liquid(rp", /\}\), (\d+)\)/g),
        prod: { value: () => LIQUID.sparkAtMs },
      },
      {
        name: "goo blur",
        value: "7",
        ref: page('<filter id="goo"', /stdDeviation="(\d+)"/g),
        prod: { value: () => LIQUID.gooBlur },
      },
    ],
  },
  {
    id: "seal-checkbox",
    element: "Seal checkbox",
    task: "PD-05",
    status: "required",
    values: [
      {
        name: "box",
        value: "480",
        ref: js("transform: 'scale(.72)'", /duration: (\d+)/g),
        prod: { value: () => SEAL.boxMs },
      },
      {
        name: "flood",
        value: ".38s var(--ease-out)",
        ref: css(".box::before", "transition", "clip-path"),
        prod: { file: MOLTEN_CSS, css: ".m-box::before", prop: "transition", part: "clip-path" },
      },
      {
        name: "tick",
        value: ".3s var(--ease-out)",
        ref: css(".box svg", "transition", "stroke-dashoffset"),
        prod: {
          file: MOLTEN_CSS,
          css: ".m-box svg",
          prop: "transition",
          part: "stroke-dashoffset",
        },
      },
      {
        name: "ring",
        value: ".6s var(--ease-out)",
        ref: css(".box.burst::after", "animation", "ring"),
        prod: { file: MOLTEN_CSS, css: ".m-box.burst::after", prop: "animation", part: "m-ring" },
      },
      {
        name: "sparks at",
        value: "120",
        ref: js("speed: [90, 240]", /\}\), (\d+)\)/g),
        prod: { value: () => SEAL.sparkAtMs },
      },
    ],
  },
  {
    id: "tabs",
    element: "Tabs",
    task: "PD-06",
    status: "required",
    values: [
      {
        name: "pill",
        value: ".6s var(--spring)",
        ref: css(".seg-ind,.seg-trail", "transition", "transform"),
        prod: { value: () => `${String(TABS.pillMs / 1000).replace(/^0/, "")}s var(--spring)` },
      },
      {
        name: "trail",
        value: ".95s",
        ref: css(".seg-trail", "transition-duration"),
        prod: { value: () => `${String(TABS.trailMs / 1000).replace(/^0/, "")}s` },
      },
      {
        name: "panel slide",
        value: "380",
        ref: js("function go(", /duration: (\d+)/g),
        prod: { value: () => TABS.panelMs },
      },
      {
        name: "panel shift (px)",
        value: "32",
        ref: js("function go(", /dir \* (\d+)\}px/g),
        prod: { value: () => TABS.panelShiftPx },
      },
      {
        name: "count-up",
        value: "650",
        ref: js("function go(", /countUp\(big, \+big\.dataset\.n, (\d+)\)/g),
        prod: { value: () => TABS.countUpMs },
      },
    ],
  },
  {
    id: "stars",
    element: "Stars",
    task: "PD-06",
    status: "required",
    values: [
      {
        name: "star pop",
        value: "480",
        ref: js("stars.slice(0, val)", /duration: (\d+)/g),
        prod: { value: () => STARS.popMs },
      },
      {
        name: "sparks per star",
        value: "7",
        ref: js("stars.slice(0, val)", /count: (\d+)/g),
        prod: { value: () => STARS.sparks },
      },
      {
        name: "label",
        value: "300",
        ref: js("stars.slice(0, val)", /duration: (\d+)/g, 1),
        prod: { value: () => STARS.labelMs },
      },
      {
        name: "stagger",
        value: "70",
        ref: js("stars.slice(0, val)", /delay: val \* (\d+)/g),
        prod: { value: () => STARS.staggerMs },
      },
      {
        name: "the two choices",
        value: ".5s var(--spring) both",
        ref: css(".rate-actions.show button", "animation", "pop"),
        prod: {
          file: MOLTEN_CSS,
          css: ".m-rate-actions[data-show] button",
          prop: "animation",
          part: "m-pop",
        },
      },
      {
        name: "second choice delay",
        value: ".06s",
        ref: css(".rate-actions.show button + button", "animation-delay"),
        prod: {
          file: MOLTEN_CSS,
          css: ".m-rate-actions[data-show] button + button",
          prop: "animation-delay",
        },
      },
    ],
  },
  {
    id: "slider",
    element: "Slider",
    task: "PD-06",
    status: "required",
    values: [
      {
        name: "bubble tilt limit (deg)",
        value: "28",
        ref: js("--tilt', clamp(", /clamp\(-(\d+),/g),
        prod: { value: () => SLIDER.tiltMaxDeg },
      },
      {
        name: "bubble tilt per speed (deg per gold/ms, 0–720 range)",
        value: "60",
        ref: js("--tilt', clamp(", /-vel \* (\d+)\)/g),
        prod: { value: () => SLIDER.tiltPerSpeed / 720 },
      },
      {
        name: "shortest input gap (ms)",
        value: "16",
        ref: js("vel = (v - lastV)", /Math\.max\((\d+),/g),
        prod: { value: () => SLIDER.minDtMs },
      },
      {
        name: "upright after idle (ms)",
        value: "90",
        ref: js("--tilt', clamp(", /'0deg'\), (\d+)\)/g),
        prod: { value: () => SLIDER.settleMs },
      },
      {
        name: "bubble spring back",
        value: ".5s var(--spring)",
        ref: css(".bubble", "transition", "transform"),
        prod: { file: MOLTEN_CSS, css: ".m-bubble", prop: "transition", part: "transform" },
      },
      {
        name: "notch sparks",
        value: "12",
        ref: js("[240, 480, 720].forEach", /count: (\d+)/g),
        prod: { value: () => SLIDER.sparks },
      },
      {
        name: "glint loop",
        value: "2.4s var(--ease-io) infinite",
        ref: css(".sl-fill::after", "animation", "glint"),
        prod: { file: MOLTEN_CSS, css: ".m-sl-fill::after", prop: "animation", part: "m-glint" },
      },
    ],
  },
  {
    id: "text-field",
    element: "Text field",
    task: "PD-06",
    status: "required",
    values: [
      {
        name: "beam",
        value: ".55s var(--ease-out)",
        ref: css(".beam", "transition", "transform"),
        prod: { file: MOLTEN_CSS, css: ".m-beam", prop: "transition", part: "transform" },
      },
      {
        name: "label",
        value: ".35s var(--spring)",
        ref: css(".field label", "transition", "transform"),
        prod: { file: MOLTEN_CSS, css: ".m-field label", prop: "transition", part: "transform" },
      },
      {
        name: "shake",
        value: "420",
        ref: js("anim(field", /duration: (\d+)/g),
        prod: { value: () => FIELD.shakeMs },
      },
      {
        name: "tick",
        value: ".4s var(--ease-out)",
        ref: css(".field .okmark", "transition", "stroke-dashoffset"),
        prod: {
          file: MOLTEN_CSS,
          css: ".m-okmark",
          prop: "transition",
          part: "stroke-dashoffset",
        },
      },
      {
        name: "sign-in label back",
        value: "2200",
        ref: js("celebrate(btn, null, 0)", /rollLabel\(btn, (\d+)\)/g),
        prod: { value: () => BUTTON.signInBackMs },
      },
    ],
  },
  {
    id: "member-card",
    element: "Member card",
    task: "PD-06",
    status: "required",
    values: [
      {
        name: "tracking",
        value: ".12s linear",
        ref: css(".mcard.live", "transition", "transform"),
        prod: { file: MOLTEN_CSS, css: ".m-mcard.live", prop: "transition", part: "transform" },
      },
      {
        name: "spring back and flip",
        value: ".7s var(--spring)",
        ref: css(".mcard", "transition", "transform"),
        prod: { file: MOLTEN_CSS, css: ".m-mcard", prop: "transition", part: "transform" },
      },
      {
        name: "idle sway",
        value: "7s var(--ease-io) infinite alternate",
        ref: css(".mcard.idle", "animation", "sway"),
        prod: { file: MOLTEN_CSS, css: ".m-mcard.idle", prop: "animation", part: "m-sway" },
      },
      {
        name: "tilt across the height (deg, ±half)",
        value: "22",
        ref: js("card.style.setProperty('--rx'", /\(\.5 - py\) \* (\d+)\)/g),
        prod: { value: () => MEMBER_CARD.tiltXDeg },
      },
      {
        name: "tilt across the width (deg, ±half)",
        value: "26",
        ref: js("card.style.setProperty('--rx'", /\(px - \.5\) \* (\d+)\)/g),
        prod: { value: () => MEMBER_CARD.tiltYDeg },
      },
      {
        name: "foil size",
        value: "260%",
        ref: css(".holo", "background-size", "260%"),
        prod: { value: () => `${String(Math.round(MEMBER_CARD.holoSize * 100))}%` },
      },
    ],
  },
  {
    id: "toast",
    element: "Toast",
    task: "PD-04",
    status: "required",
    values: [
      {
        name: "in",
        value: "520",
        ref: js("function toast", /duration: (\d+)/g, 0),
        prod: { value: () => TOAST.inMs },
      },
      // The toast's entrance passes `springEasing()`, the reference's SPRING (toast.test.tsx asserts it).
      {
        name: "in easing",
        value: "SPRING",
        ref: js("function toast", /easing: (\w+)/g, 0),
        prod: { value: () => "SPRING" },
      },
      {
        name: "coin spin",
        value: "800",
        ref: js("function toast", /duration: (\d+)/g, 1),
        prod: { value: () => TOAST.coinMs },
      },
      {
        name: "progress",
        value: "3600",
        ref: js("function toast", /duration: (\d+)/g, 2),
        prod: { value: () => TOAST.showMs },
      },
      {
        name: "out",
        value: "260",
        ref: js("function toast", /duration: (\d+)/g, 3),
        prod: { value: () => TOAST.outMs },
      },
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
      {
        name: "tile pointer light",
        value: ".35s",
        ref: css(".tile::before", "transition", "opacity"),
        prod: {
          file: "src/styles/molten.css",
          css: ".m-tile::before",
          prop: "transition",
          part: "opacity",
        },
      },
      {
        name: "tile scroll-in rise range",
        value: "entry 0% entry 30%",
        ref: css(".tile", "animation-range"),
        prod: { file: "src/styles/molten.css", css: ".m-tile", prop: "animation-range" },
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
    status: "required",
    values: [
      {
        name: "icon lift",
        value: ".45s var(--spring)",
        ref: css(".dk svg", "transition", "transform"),
        prod: { file: MOLTEN_CSS, css: ".m-dk svg", prop: "transition", part: "transform" },
      },
      {
        name: "Scan halo",
        value: "2.6s linear infinite",
        ref: css(".scan::before", "animation", "spin"),
        prod: { file: MOLTEN_CSS, css: ".m-scan::before", prop: "animation", part: "m-spin" },
      },
      {
        name: "Scan radar",
        value: "2.4s var(--ease-out) infinite",
        ref: css(".scan::after", "animation", "radar"),
        prod: { file: MOLTEN_CSS, css: ".m-scan::after", prop: "animation", part: "m-radar" },
      },
      {
        name: "Scan press",
        value: "500",
        ref: js("$('#scanBtn')", /duration: (\d+)/g),
        prod: { value: () => DOCK.scanPressMs },
      },
      {
        name: "Scan sparks",
        value: "26",
        ref: js("$('#scanBtn')", /count: (\d+)/g),
        prod: { value: () => DOCK.scanSparks },
      },
    ],
  },
  {
    id: "wallet-stack",
    element: "Wallet stack",
    task: "PD-08",
    status: "required",
    values: [
      {
        name: "fan-out",
        value: ".6s var(--spring)",
        ref: css(".wcard", "transition", "transform"),
        prod: { file: MOLTEN_CSS, css: ".m-wslot", prop: "transition", part: "transform" },
      },
      {
        name: "fan-out offset (24 px × index)",
        value: "translateY(calc(var(--i) * 24px))",
        ref: css(".stack:hover .wcard", "transform"),
        prod: { file: MOLTEN_CSS, css: ".m-stack:hover .m-wslot", prop: "transform" },
      },
      {
        name: "shine loop",
        value: "5s var(--ease-io) infinite",
        ref: css(".wcard::after", "animation", "cardshine"),
        prod: { file: MOLTEN_CSS, css: ".m-wcard::after", prop: "animation", part: "m-cardshine" },
      },
    ],
  },
  {
    id: "card-to-shop",
    element: "Card → shop",
    task: "PD-08",
    status: "required",
    values: [
      {
        name: "wipe duration",
        value: "620",
        ref: js("$$('.wcard').forEach(c => c.addEventListener('click'", /duration: (\d+), easing/g),
        prod: { value: () => WIPE.durationMs },
      },
      {
        name: "wipe easing",
        value: "cubic-bezier(.65,0,.35,1)",
        ref: js("$$('.wcard').forEach(c => c.addEventListener('click'", /easing: '([^']+)'/g),
        prod: { value: () => WIPE.easing },
      },
      {
        name: "shop follows",
        value: "110",
        ref: js("$$('.wcard').forEach(c => c.addEventListener('click'", /delay: (\d+), easing/g),
        prod: { value: () => WIPE.shopDelayMs },
      },
      {
        name: "wallet scale",
        value: ".92",
        ref: js("$$('.wcard').forEach(c => c.addEventListener('click'", /scale\((\.\d+)\)/g),
        prod: { value: () => WIPE.walletScale },
      },
      {
        name: "wallet opacity",
        value: ".4",
        ref: js("$$('.wcard').forEach(c => c.addEventListener('click'", /opacity: (\.\d+)/g),
        prod: { value: () => WIPE.walletOpacity },
      },
      {
        name: "wallet duration",
        value: "600",
        ref: js("$$('.wcard').forEach(c => c.addEventListener('click'", /\{ duration: (\d+) \}/g),
        prod: { value: () => WIPE.walletMs },
      },
      {
        name: "radius factor (hypot ×)",
        value: "1.05",
        ref: js("const R = () =>", /\* (\d\.\d+);/g),
        prod: { value: () => WIPE.radiusFactor },
      },
      {
        name: "gold bar fill",
        value: "900",
        ref: js(
          "$$('.wcard').forEach(c => c.addEventListener('click'",
          /#sBar[^;]*duration: (\d+)/g,
        ),
        prod: { value: () => WIPE.bar.ms },
      },
      {
        name: "gold bar delay",
        value: "420",
        ref: js("$$('.wcard').forEach(c => c.addEventListener('click'", /#sBar[^;]*delay: (\d+)/g),
        prod: { value: () => WIPE.bar.delayMs },
      },
      {
        name: "content rise",
        value: "520",
        ref: js(
          "$$('.wcard').forEach(c => c.addEventListener('click'",
          /duration: (\d+), delay: 300/g,
        ),
        prod: { value: () => WIPE.rise.ms },
      },
      {
        name: "content rise start",
        value: "300",
        ref: js("$$('.wcard').forEach(c => c.addEventListener('click'", /delay: (\d+) \+ k/g),
        prod: { value: () => WIPE.rise.delayMs },
      },
      {
        name: "content rise stagger",
        value: "60",
        ref: js("$$('.wcard').forEach(c => c.addEventListener('click'", /k \* (\d+)/g),
        prod: { value: () => WIPE.rise.staggerMs },
      },
      {
        name: "content rise distance (px)",
        value: "22",
        ref: js("$$('.wcard').forEach(c => c.addEventListener('click'", /translateY\((\d+)px\)/g),
        prod: { value: () => WIPE.rise.fromPx },
      },
      {
        name: "sparks",
        value: "22",
        ref: js("$$('.wcard').forEach(c => c.addEventListener('click'", /count: (\d+), speed/g),
        prod: { value: () => WIPE.sparks.count },
      },
      {
        name: "sparks delay",
        value: "80",
        ref: js("$$('.wcard').forEach(c => c.addEventListener('click'", /\}\), (\d+)\)/g),
        prod: { value: () => WIPE.sparks.delayMs },
      },
      {
        name: "back duration",
        value: "520",
        ref: js("$('#backBtn').addEventListener('click'", /duration: (\d+), easing/g),
        prod: { value: () => WIPE.back.ms },
      },
      {
        name: "wallet back delay",
        value: "80",
        ref: js("$('#backBtn').addEventListener('click'", /delay: (\d+) \}/g),
        prod: { value: () => WIPE.back.walletDelayMs },
      },
    ],
  },
  { id: "gilded-gate", element: "Gilded Gate 2.0", task: "PD-09", status: "pending", values: [] },
  {
    id: "vault",
    element: "Vault pour / reward / redeem",
    task: "PD-10",
    status: "required",
    values: [
      {
        name: "first-view pour",
        value: "900",
        ref: js("if (en.isIntersecting && !seen)", /pour\(720, (\d+)\)/g),
        prod: { value: () => POUR.ms.pour },
      },
      {
        name: "first-view wait",
        value: "200",
        ref: js("if (en.isIntersecting && !seen)", /pour\(720, \d+\), (\d+)\)/g),
        prod: { value: () => POUR.view.delayMs },
      },
      {
        name: "first-view threshold",
        value: ".45",
        ref: js("if (en.isIntersecting && !seen)", /threshold: (\.\d+)/g),
        prod: { value: () => POUR.view.threshold },
      },
      {
        name: "add pour",
        value: "1000",
        ref: js("function pour(to, ms =", /ms = (\d+)\)/g),
        prod: { value: () => POUR.ms.add },
      },
      {
        name: "fill pour",
        value: "1500",
        ref: js("$('#fillBtn').addEventListener", /pour\(MAX, (\d+)\)/g),
        prod: { value: () => POUR.ms.fill },
      },
      {
        name: "drain",
        value: "600",
        ref: js("$('#resetBtn').addEventListener", /duration: (\d+), fill/g),
        prod: { value: () => POUR.ms.drain },
      },
      {
        name: "splash every",
        value: "140",
        ref: js("function pour(to, ms =", /lastSplash > (\d+)/g),
        prod: { value: () => POUR.splash.everyMs },
      },
      {
        name: "splash until",
        value: ".9",
        ref: js("function pour(to, ms =", /&& k < (\.\d+)/g),
        prod: { value: () => POUR.splash.until },
      },
      {
        name: "splash sparks",
        value: "4",
        ref: js("function pour(to, ms =", /type: 'spark', count: (\d+), speed: \[60/g),
        prod: { value: () => POUR.splash.count },
      },
      {
        name: "stream fade",
        value: "220",
        ref: js("function pour(to, ms =", /\{ opacity: 0 \}\], \{ duration: (\d+)/g),
        prod: { value: () => POUR.streamFadeMs },
      },
      {
        name: "glint",
        value: "700",
        ref: js(
          "function pour(to, ms =",
          /translateX\(460px\)', opacity: 1 \}\], \{ duration: (\d+)/g,
        ),
        prod: { value: () => POUR.glint.ms },
      },
      {
        name: "glint travel (px)",
        value: "460",
        ref: js("function pour(to, ms =", /translateX\((\d+)px\)', opacity: 1 \}\]/g),
        prod: { value: () => POUR.glint.dx },
      },
      {
        name: "stamp",
        value: "1400",
        ref: js("function pour(to, ms =", /rotate\(-4deg\)' \}\], \{ duration: (\d+)/g),
        prod: { value: () => POUR.stamp.ms },
      },
      {
        name: "wave",
        value: "2.2s linear infinite",
        ref: css(".ingot .wave", "animation", "wave"),
        prod: {
          file: INGOT_CSS,
          css: ".m-ingot-wave",
          prop: "animation",
          part: "m-ingot-wave",
        },
      },
      {
        name: "unlock after landing",
        value: "250",
        ref: js("function pour(to, ms =", /setTimeout\(unlock, (\d+)\)/g),
        prod: { value: () => VAULT.unlock.delayMs },
      },
      {
        name: "ring pulse",
        value: "900",
        ref: js("function unlock()", /scale\(3\.2\)' \}\], \{ duration: (\d+)/g),
        prod: { value: () => VAULT.unlock.ring.ms },
      },
      {
        name: "ring scale",
        value: "3.2",
        ref: js("function unlock()", /scale\((\d\.\d)\)' \}\], \{ duration/g),
        prod: { value: () => VAULT.unlock.ring.to },
      },
      {
        name: "rays",
        value: ".8s",
        ref: css(".v-rays", "transition", "opacity"),
        prod: { file: MOLTEN_CSS, css: ".m-v-rays", prop: "transition", part: "opacity" },
      },
      {
        name: "ingot lift",
        value: ".7s var(--spring)",
        ref: css(".ingot", "transition", "transform"),
        prod: { file: INGOT_CSS, css: ".m-ingot", prop: "transition", part: "transform" },
      },
      {
        name: "ingot lift transform",
        value: "translateY(-12px) scale(1.03)",
        ref: css(".vault.unlocked .ingot", "transform"),
        prod: { file: INGOT_CSS, css: ".m-ingot-box[data-lifted] .m-ingot", prop: "transform" },
      },
      {
        name: "gold leaves",
        value: "70",
        ref: js("function unlock()", /type: 'leaf', count: (\d+)/g),
        prod: { value: () => VAULT.unlock.leaves.count },
      },
      {
        name: "coins",
        value: "14",
        ref: js("function unlock()", /type: 'coin', count: (\d+)/g),
        prod: { value: () => VAULT.unlock.coins.count },
      },
      {
        name: "sparks",
        value: "30",
        ref: js("function unlock()", /type: 'spark', count: (\d+)/g),
        prod: { value: () => VAULT.unlock.sparks.count },
      },
      {
        name: "card flip",
        value: "700",
        ref: js("function unlock()", /duration: (\d+), delay: \d+, easing: OUT/g),
        prod: { value: () => VAULT.unlock.card.ms },
      },
      {
        name: "card flip delay",
        value: "350",
        ref: js("function unlock()", /delay: (\d+), easing: OUT/g),
        prod: { value: () => VAULT.unlock.card.delayMs },
      },
      {
        name: "card flip from (deg)",
        value: "80",
        ref: js("function unlock()", /rotateX\((\d+)deg\) translateY/g),
        prod: { value: () => VAULT.unlock.card.fromDeg },
      },
      {
        name: "code after press",
        value: "320",
        ref: js("redeemBtn.addEventListener('click'", /\n {4}\}, (\d+)\);/g),
        prod: { value: () => VAULT.redeem.codeDelayMs },
      },
      {
        name: "digit flip",
        value: "380",
        ref: js("redeemBtn.addEventListener('click'", /duration: (\d+), delay: k/g),
        prod: { value: () => VAULT.redeem.digitMs },
      },
      {
        name: "digit stagger",
        value: "60",
        ref: js("redeemBtn.addEventListener('click'", /delay: k \* (\d+)/g),
        prod: { value: () => VAULT.redeem.staggerMs },
      },
      {
        name: "code life (min)",
        value: "15",
        ref: js("redeemBtn.addEventListener('click'", /Date\.now\(\) \+ (\d+) \* 60/g),
        prod: { value: () => VAULT.redeem.validMs / 60_000 },
      },
      {
        name: "countdown tick",
        value: "250",
        ref: js("cdTimer = setInterval", /if \(!left\) clearInterval\(cdTimer\); \}, (\d+)\)/g),
        prod: { value: () => VAULT.redeem.tickMs },
      },
    ],
  },
  {
    id: "fx-engine",
    element: "FX engine",
    task: "PD-03",
    status: "required",
    values: [
      {
        name: "particle cap, lite",
        value: "160",
        ref: js("const MAX = lite", /lite \? (\d+)/g),
        prod: { value: () => FX.cap.lite },
      },
      {
        name: "particle cap, full",
        value: "420",
        ref: js("const MAX = lite", /lite \? \d+ : (\d+)/g),
        prod: { value: () => FX.cap.full },
      },
      {
        name: "lite count factor",
        value: ".5",
        ref: js("let n = Math.round", /lite \? (\.\d+)/g),
        prod: { value: () => FX.liteCountFactor },
      },
      {
        name: "default count",
        value: "20",
        ref: js("let n = Math.round", /o\.count \|\| (\d+)/g),
        prod: { value: () => FX.defaultCount },
      },
      {
        name: "default speed (px/s)",
        value: "150, 420",
        ref: js("const [s0, s1]", /\[(\d+, \d+)\]/g),
        prod: { value: () => FX.defaultSpeed.join(",") },
      },
      {
        name: "canvas DPR cap",
        value: "2",
        ref: js("function size()", /Math\.min\((\d+), devicePixelRatio/g),
        prod: { value: () => FX.dprCap },
      },
      {
        name: "frame step cap (s)",
        value: ".033",
        ref: js("function tick(now)", /Math\.min\((\.\d+)/g),
        prod: { value: () => FX.maxDt },
      },
      {
        name: "spark gravity",
        value: "520",
        ref: js("o.gravity ??", /'spark' \? (\d+)/g),
        prod: { value: () => FX.gravity.spark },
      },
      {
        name: "coin gravity",
        value: "1100",
        ref: js("o.gravity ??", /'coin' \? (\d+)/g),
        prod: { value: () => FX.gravity.coin },
      },
      {
        name: "leaf gravity",
        value: "60",
        ref: js("o.gravity ??", /'coin' \? \d+ : (\d+)/g),
        prod: { value: () => FX.gravity.leaf },
      },
      {
        name: "drag",
        value: ".975",
        ref: js("drag: type === 'leaf'", /\.985 : (\.\d+)/g),
        prod: { value: () => FX.drag.spark },
      },
      {
        name: "leaf drag",
        value: ".985",
        ref: js("drag: type === 'leaf'", /'leaf' \? (\.\d+)/g),
        prod: { value: () => FX.drag.leaf },
      },
      {
        name: "spark life (s)",
        value: ".45, .9",
        ref: js("const life = rnd(", /\[1\.1, 1\.7\] : \[([.\d]+, [.\d]+)\]/g),
        prod: { value: () => FX.life.spark.join(",") },
      },
      {
        name: "coin life (s)",
        value: "1.1, 1.7",
        ref: js("const life = rnd(", /'coin' \? \[([.\d]+, [.\d]+)\]/g),
        prod: { value: () => FX.life.coin.join(",") },
      },
      {
        name: "leaf life (s)",
        value: "2.2, 3.4",
        ref: js("const life = rnd(", /'leaf' \? \[([.\d]+, [.\d]+)\]/g),
        prod: { value: () => FX.life.leaf.join(",") },
      },
      {
        name: "spark size (px)",
        value: "10, 22",
        ref: js("size: type === 'coin'", /: rnd\((\d+, \d+)\), rot/g),
        prod: { value: () => FX.size.spark.join(",") },
      },
      {
        name: "coin size (px)",
        value: "16, 26",
        ref: js("size: type === 'coin'", /'coin' \? rnd\((\d+, \d+)\)/g),
        prod: { value: () => FX.size.coin.join(",") },
      },
      {
        name: "leaf size (px)",
        value: "7, 13",
        ref: js("size: type === 'coin'", /'leaf' \? rnd\((\d+, \d+)\)/g),
        prod: { value: () => FX.size.leaf.join(",") },
      },
      {
        name: "spin (rad/s)",
        value: "-8, 8",
        ref: js("vr: rnd(", /vr: rnd\((-\d+, \d+)\)/g),
        prod: { value: () => FX.spin.join(",") },
      },
      {
        name: "flip speed (rad/s)",
        value: "6, 14",
        ref: js("vf: rnd(", /vf: rnd\((\d+, \d+)\)/g),
        prod: { value: () => FX.flipSpeed.join(",") },
      },
      {
        name: "leaf sway rate",
        value: "3",
        ref: js("p.sway += dt", /p\.sway \+= dt \* (\d+)/g),
        prod: { value: () => FX.leafSway.rate },
      },
      {
        name: "leaf sway (px/s)",
        value: "40",
        ref: js("p.sway += dt", /Math\.sin\(p\.sway\) \* (\d+)/g),
        prod: { value: () => FX.leafSway.px },
      },
      {
        name: "fade-out (last share of life)",
        value: ".35",
        ref: js("const t = p.life / p.max", /t < (\.\d+)/g),
        prod: { value: () => FX.fadeFrom },
      },
      {
        name: "leaf colours",
        value: "'#F2C14E', '#FFE08A', '#C8922C', '#FFF1BF', '#E0AE3E', '#B9862A'",
        ref: js("const leafCols", /const leafCols = \[([^\]]+)\]/g),
        prod: { value: () => FX.leafColours.map((c) => `'${c}'`).join(",") },
      },
      {
        name: "spark trail (s of velocity)",
        value: ".035",
        ref: js("ctx.lineTo(p.x - p.vx", /p\.vx \* (\.\d+)/g),
        prod: { value: () => FX.sparkTrail },
      },
      {
        name: "spark trail width (px)",
        value: "1.6",
        ref: js("if (p.type === 'spark') {", /ctx\.lineWidth = ([\d.]+)/g),
        prod: { value: () => FX.sparkLineWidth },
      },
    ],
  },
  {
    id: "press-kit",
    element: "Press kit (usePress, useMagnetic, ripple, celebrate, useCountUp, anim)",
    task: "PD-03",
    status: "required",
    values: [
      {
        name: "press scale",
        value: ".93",
        ref: css(".btn.down", "--s"),
        prod: { file: "src/styles/molten.css", css: ".m-press.down", prop: "--s" },
      },
      {
        name: "press scale (TS)",
        value: ".93",
        ref: css(".btn.down", "--s"),
        prod: { value: () => PRESS.scale },
      },
      {
        name: "ripple duration (ms)",
        value: "720",
        ref: js("function ripple", /duration: (\d+)/g),
        prod: { value: () => PRESS.rippleMs },
      },
      {
        name: "ripple diameter (× longer side)",
        value: "2.4",
        ref: js("function ripple", /Math\.max\(r\.width, r\.height\) \* ([\d.]+)/g),
        prod: { value: () => PRESS.rippleSize },
      },
      {
        name: "celebrate sparks",
        value: "28",
        ref: js("function celebrate", /type: 'spark', count: (\d+)/g),
        prod: { value: () => PRESS.celebrate.sparks },
      },
      {
        name: "celebrate spark speed (px/s)",
        value: "180, 520",
        ref: js("function celebrate", /type: 'spark', count: \d+, speed: \[(\d+, \d+)\]/g),
        prod: { value: () => PRESS.celebrate.sparkSpeed.join(",") },
      },
      {
        name: "celebrate coins",
        value: "6",
        ref: js("function celebrate", /coins = (\d+)/g),
        prod: { value: () => PRESS.celebrate.coins },
      },
      {
        name: "celebrate coin speed (px/s)",
        value: "260, 520",
        ref: js("function celebrate", /type: 'coin', count: coins, speed: \[(\d+, \d+)\]/g),
        prod: { value: () => PRESS.celebrate.coinSpeed.join(",") },
      },
      {
        name: "celebrate coin spread (rad)",
        value: "1.6",
        ref: js("function celebrate", /spread: ([\d.]+)/g),
        prod: { value: () => PRESS.celebrate.coinSpread },
      },
      {
        name: "magnetic lean x (± px)",
        value: "8",
        ref: js("function pressable", /clamp\(-(\d+), \d+, \(x - r\.width/g),
        prod: { value: () => PRESS.magnetic.x },
      },
      {
        name: "magnetic lean y (± px)",
        value: "6",
        ref: js("function pressable", /clamp\(-(\d+), \d+, \(y - r\.height/g),
        prod: { value: () => PRESS.magnetic.y },
      },
      {
        name: "magnetic factor x",
        value: ".1",
        ref: js("function pressable", /\(x - r\.width \/ 2\) \* ([.\d]+)/g),
        prod: { value: () => PRESS.magnetic.kx },
      },
      {
        name: "magnetic factor y",
        value: ".25",
        ref: js("function pressable", /\(y - r\.height \/ 2\) \* ([.\d]+)/g),
        prod: { value: () => PRESS.magnetic.ky },
      },
      {
        name: "count-up duration (ms)",
        value: "700",
        ref: js("function countUp", /ms = (\d+)/g),
        prod: { value: () => PRESS.countUpMs },
      },
      {
        name: "anim() cap under reduced motion (ms)",
        value: "150",
        ref: js("function anim(", /Math\.min\(opts\.duration \|\| \d+, (\d+)\)/g),
        prod: { value: () => RM_MAX_MS },
      },
    ],
  },
];
