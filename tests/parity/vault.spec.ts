import { expect, type Page, test } from "@playwright/test";
import { diffRatio } from "./support/diff";
import { fireTimed, freezeTimed, openForMotion, referenceUrl } from "./support/motion";
import { attachPair, capture } from "./support/reference";
import { PARITY_PARTS, parityLimit } from "../../src/features/dev/molten/parity-parts";

/**
 * Gold Vault parity (PD-10): the reference vault against the app's (`/dev/molten`: `GoldVault`, `IngotPour`,
 * `RewardUnlocked`, `RedeemCode`), driven the same way on both under the paused page clock: at rest after the
 * first-view pour, mid-pour (500 ms into "Add a visit"), full (100 ms after "Fill the vault" lands, glint and
 * stream fade running), unlocked (the reward moment at rest) and redeemed (the code's digits and countdown).
 * The reference's pour is a requestAnimationFrame tween on the page clock; the app's is Web Animations, which run
 * on the real timeline: each capture pauses every animation at its own age (`freezeTimed`), and between moments
 * `release` lets the app's paused animations finish so its own steps (landing, unlock) follow.
 */
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;
/** At rest (nothing moving): the static limit; moving frames: the frame limit (PD-01). */
const REST_DIFF = 0.01;
const FRAME_DIFF = 0.02;

const vault = PARITY_PARTS.find((p) => p.name === "vault");
const reward = PARITY_PARTS.find((p) => p.name === "reward");

/** The vault's buttons, the same on both pages (Add a visit, Fill the vault; Redeem inside the reward card). */
const ADD = "button:not([data-parity])";
const FILL = '[data-parity="orbit-button"]';

/** Polls `test` on the page from Node (under the paused page clock in-page polling never runs). */
async function until(page: Page, what: string, test: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!(await page.evaluate(test))) {
    if (Date.now() > deadline) throw new Error(`never happened: ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Both pages, the same page-clock time. */
async function run(pages: readonly Page[], ms: number): Promise<void> {
  for (const p of pages) await p.clock.runFor(ms);
}

/**
 * Lets paused animations go on: those past their end finish (their `finished` resolves, so the app's pour lands),
 * the others play on (a paused one at its end would otherwise rewind on `play()`).
 */
async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      if (a.playState !== "paused") continue;
      const end = a.effect?.getComputedTiming().endTime;
      if (typeof end === "number" && Number.isFinite(end) && Number(a.currentTime) >= end)
        a.finish();
      else a.play();
    }
  });
}

/** The app's pour has landed and nothing waits (the reference's tween ends on the page clock). */
const appLanded = (): boolean =>
  document.querySelector('[data-parity="vault"] .ingot-pour')?.getAttribute("data-ingot-state") ===
  "done";

async function compare(
  ref: Page,
  page: Page,
  part: "vault" | "reward",
  state: string,
  limit: number,
): Promise<void> {
  const spec = part === "vault" ? vault : reward;
  if (!spec) throw new Error(`${part} part missing`);
  const max = parityLimit(spec, page.context().browser()?.browserType().name() ?? "", limit);
  const a = await capture(ref, part);
  const b = await capture(page, part);
  const d = diffRatio(a, b);
  const name = `${part}-${state}-${String(page.viewportSize()?.width ?? 0)}`;
  if (d.ratio > max) await attachPair(name, a, b);
  expect(d.ratio, `${name}: ${d.why ?? ""} ${spec.tolerance?.why ?? ""}`).toBeLessThanOrEqual(max);
}

test.describe("[PD-10] Gold Vault parity", () => {
  // Two pages through five moments, each with real-time waits for the app's animations to land.
  test.describe.configure({ timeout: 180_000 });

  for (const vp of VIEWPORTS) {
    test(`[PD-10] the vault at rest, mid-pour, full, unlocked and redeemed matches the reference at ${String(vp.width)}`, async ({
      page,
      context,
    }) => {
      const ref = await context.newPage();
      await openForMotion(ref, referenceUrl, vp.width, vp.height);
      await openForMotion(page, "/dev/molten", vp.width, vp.height);
      const both = [ref, page] as const;

      // Rest: scrolled into view, the first-view pour (200 ms + 900 ms) and its glint run out.
      for (const p of both) await capture(p, "vault");
      await until(
        ref,
        "the reference's pour starts empty",
        () =>
          document.querySelector<SVGGElement>("#liquid")?.style.transform === "translateY(182px)",
      );
      await until(
        page,
        "the app's pour starts",
        () =>
          document.querySelector('[data-parity="vault"] .ingot-pour[data-ingot-state="run"]') !==
          null,
      );
      await run(both, 2_500);
      for (const p of both) await freezeTimed(p, true);
      await compare(ref, page, "vault", "rest", REST_DIFF);

      // Mid-pour: 500 ms into "Add a visit" (720 → 800 in 1 s: the stream, the "+80" stamp, 760 on the count).
      for (const p of both) await release(p);
      await until(page, "the app's first pour lands", appLanded);
      for (const p of both) await fireTimed(p, "vault", ADD);
      await run(both, 500);
      for (const p of both) await freezeTimed(p);
      await compare(ref, page, "vault", "mid-pour", FRAME_DIFF);

      // Full: "Fill the vault" (800 → 1,000 in 1.5 s), 100 ms after it lands: stream fading, glint crossing.
      for (const p of both) await release(p);
      await run(both, 1_500);
      await until(page, "the app's add lands", appLanded);
      for (const p of both) await fireTimed(p, "vault", FILL);
      await run(both, 1_600);
      for (const p of both) await freezeTimed(p);
      await compare(ref, page, "vault", "full", FRAME_DIFF);

      // Unlocked: 250 ms after landing the reward moment starts (rays, lift, ring, card flip, toast); at rest.
      for (const p of both) await release(p);
      await until(page, "the app's fill lands", appLanded);
      await run(both, 300);
      await until(
        ref,
        "the reference's reward",
        () => !document.querySelector<HTMLElement>("#reward")?.hidden,
      );
      await until(
        page,
        "the app's reward",
        () => document.querySelector('[data-parity="reward"]') !== null,
      );
      await run(both, 3_000);
      for (const p of both) await freezeTimed(p, true);
      await compare(ref, page, "vault", "unlocked", REST_DIFF);
      await compare(ref, page, "reward", "unlocked", REST_DIFF);

      // Redeemed: the code 320 ms after the press, its digits flipped in and the countdown 1.2 s on (14:59).
      for (const p of both) await release(p);
      for (const p of both) await fireTimed(p, "reward", "button");
      await run(both, 320);
      await until(ref, "the reference's code", () => document.querySelector(".digits") !== null);
      await until(
        page,
        "the app's code",
        () => document.querySelector('[data-testid="redeem-code"]') !== null,
      );
      await run(both, 1_200);
      for (const p of both) await freezeTimed(p, true);
      await compare(ref, page, "reward", "redeemed", REST_DIFF);
      await compare(ref, page, "vault", "redeemed", REST_DIFF);
    });
  }
});
