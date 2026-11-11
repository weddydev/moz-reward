import { expect, test } from "./support/test";
import { vtName } from "../../src/lib/motion/route-transitions";
import type { Page } from "@playwright/test";

/**
 * P0-10 route transitions on /dev/motion. A recorder samples `document.getAnimations()` every frame from
 * just before the click, so the view-transition pseudo-element animations (and the fallback's WAAPI enter on
 * `[data-route-content]`) are read while they run.
 */
type Seen = {
  pseudo: string;
  target: string;
  props: string[];
  duration: number;
  delay: number;
  transforms: string[];
};

async function record(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __vt: Record<string, Seen>;
      __content: Seen[];
      __vtNames: Record<string, number>;
    };
    w.__vt = {};
    w.__content = [];
    w.__vtNames = {};
    const until = performance.now() + 4000;
    const describe = (a: Animation): Seen => {
      const effect = a.effect as KeyframeEffect | null;
      const frames = effect?.getKeyframes() ?? [];
      const timing = effect?.getComputedTiming();
      const target = effect?.target as HTMLElement | null;
      return {
        pseudo: effect?.pseudoElement ?? "",
        target: target?.hasAttribute("data-route-content")
          ? "route-content"
          : (target?.tagName ?? ""),
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
    };
    const seenContent = new WeakSet<Animation>();
    const tick = (): void => {
      for (const a of document.getAnimations()) {
        const effect = a.effect as KeyframeEffect | null;
        const pseudo = effect?.pseudoElement ?? "";
        if (pseudo.startsWith("::view-transition")) {
          const key = `${pseudo} ${(a as CSSAnimation).animationName || "ua"}`;
          w.__vt[key] = describe(a);
          const name = /\(([^)]+)\)/.exec(pseudo)?.[1];
          if (name && pseudo.startsWith("::view-transition-group")) w.__vtNames[name] = 1;
        } else if (
          (effect?.target as HTMLElement | null)?.hasAttribute("data-route-content") &&
          !seenContent.has(a)
        ) {
          seenContent.add(a);
          w.__content.push(describe(a));
        }
      }
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const seen = (page: Page): Promise<Seen[]> =>
  page.evaluate(() => Object.values((window as unknown as { __vt: Record<string, Seen> }).__vt));
const contentAnimations = (page: Page): Promise<Seen[]> =>
  page.evaluate(() => (window as unknown as { __content: Seen[] }).__content);
const groupNames = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Object.keys((window as unknown as { __vtNames: Record<string, number> }).__vtNames),
  );

const vtRunning = (page: Page): Promise<boolean> =>
  page.evaluate(() =>
    document
      .getAnimations()
      .some((a) =>
        (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith("::view-transition"),
      ),
  );

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

/** The page content's old/new snapshots (the directional ones carry transforms). */
const snapshots = (all: Seen[]): Seen[] =>
  all.filter((a) => /::view-transition-(old|new)\(/.test(a.pseudo));

/** Every old/new snapshot animates transform/opacity only and ends within --dur-slow (AC 1). */
function expectCompositeOnly(all: Seen[], maxMs = 380): void {
  for (const a of snapshots(all)) {
    expect(
      a.props.filter((p) => !["opacity", "transform", "mixBlendMode"].includes(p)),
      a.pseudo,
    ).toEqual([]);
    expect(a.duration + a.delay, a.pseudo).toBeLessThanOrEqual(maxMs);
  }
}

/** The new snapshot that slides, and the offset it starts from. */
const slideIn = (all: Seen[]): string[] =>
  snapshots(all)
    .filter((a) => a.pseudo.startsWith("::view-transition-new") && a.transforms.length > 0)
    .flatMap((a) => a.transforms);

const cards = (page: Page) => page.locator('[data-demo="cards"] a');

async function openGallery(page: Page): Promise<void> {
  await page.goto("/dev/motion");
  await expect(cards(page).first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("[P0-10] route transitions", () => {
  test("[P0-10] AC1 forward slides the content 8px from the right with a fade: transform + opacity, ≤ 380ms", async ({
    page,
  }) => {
    await openGallery(page);
    test.skip(!(await typedVt(page)), "typed View Transitions not supported: fallback spec");
    await record(page);
    await cards(page).first().click();
    await expect(page).toHaveURL(/\/dev\/motion\/shop\/brew-bloom$/);
    await settled(page);
    const all = await seen(page);
    expect(snapshots(all).filter((a) => a.transforms.length > 0).length).toBeGreaterThanOrEqual(2);
    expect(slideIn(all).some((t) => /translateX\(8px\)/.test(t))).toBe(true);
    expectCompositeOnly(all);
  });

  test("[P0-10] AC1 back reverses the direction (enters from the left)", async ({ page }) => {
    await page.goto("/dev/motion/shop/brew-bloom");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    test.skip(!(await typedVt(page)), "typed View Transitions not supported: fallback spec");
    await record(page);
    await page.getByRole("link", { name: "← Motion gallery" }).click();
    await expect(page).toHaveURL(/\/dev\/motion$/);
    await settled(page);
    const all = await seen(page);
    expect(slideIn(all).some((t) => /translateX\(-8px\)/.test(t))).toBe(true);
    expect(slideIn(all).some((t) => /translateX\(8px\)/.test(t))).toBe(false);
    expectCompositeOnly(all);
  });

  test("[P0-10] AC1 tab switches slide 6px in tab order; the tab bar stays still", async ({
    page,
    browserName,
  }) => {
    test.fixme(
      browserName === "webkit",
      "nested boundaries both slide in WebKit: root-snapshot rework, DECISIONS 11 Nov",
    );
    await page.goto("/dev/motion/tabs/wallet");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    test.skip(!(await typedVt(page)), "typed View Transitions not supported: fallback spec");
    const bar = page.getByRole("navigation", { name: "Demo tabs" });

    await record(page);
    await bar.getByRole("link", { name: "Me" }).click();
    await expect(page).toHaveURL(/\/tabs\/me$/);
    await settled(page);
    let all = await seen(page);
    expect(slideIn(all).some((t) => /translateX\(6px\)/.test(t))).toBe(true);
    expect(slideIn(all).some((t) => /translateX\(-?8px\)/.test(t))).toBe(false);
    // Only the tab content moves: one directional new snapshot, not the outer gallery boundary too.
    expect(
      snapshots(all).filter(
        (a) => a.pseudo.startsWith("::view-transition-new") && a.transforms.length > 0,
      ),
    ).toHaveLength(1);
    expectCompositeOnly(all);

    await record(page);
    await bar.getByRole("link", { name: "Explore" }).click();
    await expect(page).toHaveURL(/\/tabs\/explore$/);
    await settled(page);
    all = await seen(page);
    expect(slideIn(all).some((t) => /translateX\(-6px\)/.test(t))).toBe(true);
    expectCompositeOnly(all);
  });

  test("[P0-10] AC2 navigation never waits: taps register mid-transition; a second navigation wins", async ({
    page,
  }) => {
    test.fixme(
      true,
      "named content is not hit-testable mid-transition: root-snapshot rework, DECISIONS 11 Nov",
    );
    await openGallery(page);
    test.skip(!(await typedVt(page)), "typed View Transitions not supported: fallback spec");
    // Slow the transition down (every frame, for any view-transition animation) so clicks provably land
    // while it runs. Plain WAAPI, so it works in every engine.
    await page.evaluate(() => {
      const w = window as unknown as { __rate: number };
      w.__rate = 1;
      const tick = (): void => {
        for (const a of document.getAnimations()) {
          const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement ?? "";
          if (pseudo.startsWith("::view-transition") && a.playbackRate !== w.__rate) {
            a.playbackRate = w.__rate;
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const rate = (r: number): Promise<void> =>
      page.evaluate((v) => {
        (window as unknown as { __rate: number }).__rate = v;
      }, r);
    const slow = (): Promise<void> => rate(0.1);
    const normal = (): Promise<void> => rate(1);
    const clickCentre = async (name: string, role: "button" | "link"): Promise<void> => {
      const box = await page.getByRole(role, { name }).boundingBox();
      if (!box) throw new Error(`no box for ${name}`);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };
    // Records which element each click reached, so "registers" is proven at the moment of the click.
    await page.evaluate(() => {
      const w = window as unknown as { __clicks: string[] };
      w.__clicks = [];
      window.addEventListener(
        "click",
        (e) => {
          const el = (e.target as HTMLElement).closest("a,button");
          w.__clicks.push(el?.textContent.trim() ?? `<${(e.target as HTMLElement).tagName}>`);
        },
        true,
      );
    });
    const clicks = (): Promise<string[]> =>
      page.evaluate(() => (window as unknown as { __clicks: string[] }).__clicks);

    await slow();
    await cards(page).first().click();
    await expect(page).toHaveURL(/\/shop\/brew-bloom$/);
    await expect(page.getByRole("button", { name: "Tap me" })).toBeAttached();
    expect(await vtRunning(page)).toBe(true);
    await clickCentre("Tap me", "button");
    // The tap reached the destination's button while the transition was still running.
    expect(await vtRunning(page)).toBe(true);
    expect((await clicks()).at(-1)).toBe("Tap me");
    await normal();
    await expect(page.getByTestId("tap-count")).toHaveText("1 tap");
    await settled(page);

    // A second navigation started while the first runs ends on the second URL, with nothing left running.
    await slow();
    await page.getByRole("link", { name: "← Motion gallery" }).click();
    await expect(page).toHaveURL(/\/dev\/motion$/);
    await expect(cards(page).nth(1)).toBeAttached();
    expect(await vtRunning(page)).toBe(true);
    await clickCentre("Patel's Corner Store", "link");
    expect((await clicks()).at(-1)).toContain("Patel's Corner Store");
    await normal();
    await expect(page).toHaveURL(/\/shop\/patel-corner$/);
    await settled(page);
    await expect(page.getByRole("heading", { name: "Patel's Corner Store" })).toBeVisible();
    expect(await vtRunning(page)).toBe(false);
  });

  test("[P0-10] AC3 card → detail forms the shared pairs; each name is unique in the DOM", async ({
    page,
  }) => {
    await openGallery(page);
    test.skip(!(await typedVt(page)), "typed View Transitions not supported: fallback spec");
    const named = (): Promise<Record<string, number>> =>
      page.evaluate(() => {
        const counts: Record<string, number> = {};
        for (const el of document.querySelectorAll("*")) {
          const n = getComputedStyle(el).viewTransitionName;
          if (n && n !== "none") counts[n] = (counts[n] ?? 0) + 1;
        }
        return counts;
      });
    for (const n of Object.values(await named())) expect(n).toBeLessThanOrEqual(1);
    await record(page);
    await cards(page).first().click();
    await expect(page).toHaveURL(/\/shop\/brew-bloom$/);
    await settled(page);
    const names = await groupNames(page);
    expect(names).toContain(vtName("shopimage", "brew-bloom"));
    expect(names).toContain(vtName("shoptitle", "brew-bloom"));
    // The other cards' names never form a pair (their counterparts are not on this page).
    expect(
      names.filter((n) =>
        ["patel-corner", "nans-bakery"].some(
          (id) => n === vtName("shopimage", id) || n === vtName("shoptitle", id),
        ),
      ),
    ).toEqual([]);
    for (const n of Object.values(await named())) expect(n).toBeLessThanOrEqual(1);
  });
});

test.describe("[P0-10] fallback without typed View Transitions", () => {
  for (const variant of [
    {
      label: "no startViewTransition",
      init: () => {
        delete (Document.prototype as { startViewTransition?: unknown }).startViewTransition;
      },
    },
    {
      label: "View Transitions without types",
      init: () => {
        const proto = (window as unknown as { ViewTransition?: { prototype: object } })
          .ViewTransition?.prototype;
        if (proto) delete (proto as { types?: unknown }).types;
      },
    },
  ]) {
    test(`[P0-10] AC4 ${variant.label}: the new page fades in and rises 8px, nothing on exit`, async ({
      page,
      browserName,
    }) => {
      test.fixme(
        browserName === "webkit",
        "WebKit recorded no fallback enter animation: open, DECISIONS 11 Nov root snapshot",
      );
      await page.addInitScript(variant.init);
      await openGallery(page);
      expect(await typedVt(page)).toBe(false);
      await record(page);
      await cards(page).first().click();
      await expect(page).toHaveURL(/\/shop\/brew-bloom$/);
      await expect(page.getByRole("heading", { name: "Brew & Bloom Café" })).toBeVisible();
      await expect
        .poll(async () => (await contentAnimations(page)).length, { timeout: 2000 })
        .toBeGreaterThan(0);
      const enter = await contentAnimations(page);
      // One enter animation on the content, none on the outgoing page, no view-transition pseudos.
      expect(enter).toHaveLength(1);
      expect(await seen(page)).toEqual([]);
      const [a] = enter;
      expect(a?.props.sort()).toEqual(["opacity", "transform"]);
      expect(a?.transforms.some((t) => t.includes("translateY(8px)"))).toBe(true);
      expect((a?.duration ?? 0) + (a?.delay ?? 0)).toBeLessThanOrEqual(380);
      // Taps work while it runs (the content is live from the first frame).
      await page.getByRole("button", { name: "Tap me" }).click();
      await expect(page.getByTestId("tap-count")).toHaveText("1 tap");
    });
  }
});

test.describe("[P0-10] reduced motion", () => {
  for (const how of ["system", "toggle"] as const) {
    test(`[P0-10] AC5 reduced motion (${how}): route transitions only fade, ≤ 150ms, nothing moves`, async ({
      page,
    }) => {
      if (how === "system") await page.emulateMedia({ reducedMotion: "reduce" });
      else
        await page.addInitScript(() => {
          window.localStorage.setItem("moz:motion", "reduce");
        });
      await openGallery(page);
      if (how === "toggle") {
        await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");
      }
      const typed = await typedVt(page);
      await record(page);
      await cards(page).first().click();
      await expect(page).toHaveURL(/\/shop\/brew-bloom$/);
      await expect(page.getByRole("heading", { name: "Brew & Bloom Café" })).toBeVisible();
      await settled(page);
      const all = typed ? await seen(page) : await contentAnimations(page);
      if (typed) expect(all.length).toBeGreaterThan(0);
      for (const a of all) {
        // Any transform left is a zero offset or a group's identity/static matrix: nothing slides or scales.
        for (const t of a.transforms) {
          expect(t, a.pseudo).not.toMatch(/translate[XY]?\((?!0px\b)-?[\d.]+px/);
          expect(t, a.pseudo).not.toMatch(/scale/);
        }
        if (a.pseudo.startsWith("::view-transition-group")) {
          // Groups may only hold still: every keyframe's transform is the same.
          expect(new Set(a.transforms).size, a.pseudo).toBeLessThanOrEqual(1);
        }
        expect(a.duration + a.delay, a.pseudo || a.target).toBeLessThanOrEqual(150);
      }
    });
  }
});
