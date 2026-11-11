import { expect, test } from "./support/test";
import type { Page } from "@playwright/test";

/**
 * P0-10 route transitions on /dev/motion. A recorder samples `document.getAnimations()` every frame from
 * just before the click, so the view-transition pseudo-element animations are read while they run.
 */
type Seen = {
  pseudo: string;
  props: string[];
  duration: number;
  delay: number;
  transforms: string[];
};

async function record(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __vt: Record<string, Seen>; __vtRunning: boolean };
    w.__vt = {};
    w.__vtRunning = false;
    const until = performance.now() + 4000;
    const tick = (): void => {
      for (const a of document.getAnimations()) {
        const effect = a.effect as KeyframeEffect | null;
        const pseudo = effect?.pseudoElement ?? "";
        if (!pseudo.startsWith("::view-transition")) continue;
        w.__vtRunning = true;
        const frames = effect?.getKeyframes() ?? [];
        const timing = effect?.getComputedTiming();
        const key = `${pseudo} ${(a as CSSAnimation).animationName || "ua"}`;
        w.__vt[key] = {
          pseudo,
          props: [
            ...new Set(
              frames.flatMap((f) =>
                Object.keys(f).filter(
                  (k) => !["offset", "easing", "composite", "computedOffset"].includes(k),
                ),
              ),
            ),
          ],
          duration: Number(timing?.duration ?? 0),
          delay: timing?.delay ?? 0,
          transforms: frames.map((f) => String(f.transform ?? "")).filter(Boolean),
        };
      }
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const seen = (page: Page): Promise<Seen[]> =>
  page.evaluate(() => Object.values((window as unknown as { __vt: Record<string, Seen> }).__vt));

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      !document
        .getAnimations()
        .some((a) =>
          (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith("::view-transition"),
        ),
  );
}

const typedVt = (page: Page): Promise<boolean> =>
  page.evaluate(
    () =>
      typeof document.startViewTransition === "function" &&
      "types" in
        ((window as unknown as { ViewTransition?: { prototype: object } }).ViewTransition
          ?.prototype ?? {}),
  );

test.describe("[P0-10] route transitions", () => {
  test("[P0-10] forward slides the content 8px from the right with a fade: transform + opacity, ≤ 380ms", async ({
    page,
  }) => {
    await page.goto("/dev/motion");
    await expect(page.locator('[data-demo="cards"] a').first()).toBeVisible();
    test.skip(
      !(await typedVt(page)),
      "typed View Transitions not supported: the fallback spec covers it",
    );
    await record(page);
    await page.locator('[data-demo="cards"] a').first().click();
    await expect(page).toHaveURL(/\/dev\/motion\/shop\/brew-bloom$/);
    await settled(page);
    const all = await seen(page);
    const slides = all.filter(
      (a) => /::view-transition-(old|new)\(/.test(a.pseudo) && a.transforms.length > 0,
    );
    // The page content's old and new snapshots both slide (the nav-forward class), and nothing else moves.
    expect(slides.length).toBeGreaterThanOrEqual(2);
    expect(
      slides.some(
        (a) =>
          a.pseudo.startsWith("::view-transition-new") &&
          a.transforms.some((t) => t.includes("8px")),
      ),
    ).toBe(true);
    for (const a of all.filter((x) => /::view-transition-(old|new)\(/.test(x.pseudo))) {
      expect(
        a.props.filter((p) => !["opacity", "transform", "mixBlendMode"].includes(p)),
        a.pseudo,
      ).toEqual([]);
      expect(a.duration + a.delay, a.pseudo).toBeLessThanOrEqual(380);
    }
  });
});
