import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, newClientContext, test } from "./support/test";
import { vtName } from "../../src/lib/motion/route-transitions";
import type { BrowserType, Page } from "@playwright/test";

/**
 * P0-10 route transitions on /dev/motion. A recorder samples `document.getAnimations()` every frame from
 * just before the click, so the page enter (WAAPI on the live `[data-route-content]`) and the card → page
 * morph's view-transition pseudos are read while they run. The page itself is never a snapshot (DECISIONS
 * "Pages slide as live content").
 */
type Seen = {
  pseudo: string;
  target: string;
  props: string[];
  duration: number;
  delay: number;
  transforms: string[];
  /** For page enters: how many `[data-route-content]` ancestors (0 = outermost). */
  depth: number;
};

async function record(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __vt: Record<string, Seen>;
      __content: Seen[];
      __vtNames: Record<string, number>;
      __recorder: number;
      __recErrors: string[];
    };
    // One recorder at a time: a newer call stops the previous loop (it would record the same animations).
    const generation = (w.__recorder = (w.__recorder || 0) + 1);
    w.__vt = {};
    w.__recErrors = [];
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
        depth: target?.parentElement?.closest("[data-route-content]") ? 1 : 0,
      };
    };
    const seenContent = new WeakSet<Animation>();
    // Page enters are recorded when `animate()` creates them: WebKit paints only a frame every ~100ms+
    // during a view transition, so frame sampling can miss a 150ms enter. (VT pseudos are CSS animations:
    // sampled below.) The wrapper is installed once per page and calls the latest recorder.
    const onAnimate = (a: Animation, el: Element): void => {
      if (w.__recorder !== generation || !el.hasAttribute("data-route-content")) return;
      if (seenContent.has(a)) return;
      seenContent.add(a);
      w.__content.push(describe(a));
    };
    const hooked = window as unknown as { __onAnimate?: typeof onAnimate };
    if (!hooked.__onAnimate) {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- re-applied with the element as `this`
      const original = Element.prototype.animate;
      Element.prototype.animate = function (this: Element, ...args: Parameters<typeof original>) {
        const animation = original.apply(this, args);
        hooked.__onAnimate?.(animation, this);
        return animation;
      };
    }
    hooked.__onAnimate = onAnimate;
    const tick = (): void => {
      // Schedule first and read each animation on its own: one unreadable animation must not stop the
      // recording (errors are kept in __recErrors).
      if (performance.now() < until && w.__recorder === generation) requestAnimationFrame(tick);
      for (const a of document.getAnimations()) {
        try {
          readOne(a);
        } catch (error) {
          w.__recErrors.push(String(error));
        }
      }
    };
    const readOne = (a: Animation): void => {
      {
        const effect = a.effect as KeyframeEffect | null;
        const pseudo = effect?.pseudoElement ?? "";
        if (pseudo.startsWith("::view-transition")) {
          const key = `${pseudo} ${(a as CSSAnimation).animationName || "ua"}`;
          w.__vt[key] = describe(a);
          const name = /\(([^)]+)\)/.exec(pseudo)?.[1];
          if (name && pseudo.startsWith("::view-transition-group")) w.__vtNames[name] = 1;
        } else if (effect?.target) {
          // A page enter created before this recorder was hooked in (normally none).
          onAnimate(a, effect.target);
        }
      }
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

/** A page enter or a view transition is running right now. */
const motionRunning = (page: Page): Promise<boolean> =>
  page.evaluate(() =>
    document.getAnimations().some((a) => {
      const effect = a.effect as KeyframeEffect | null;
      return (
        a.playState === "running" &&
        (!!effect?.pseudoElement?.startsWith("::view-transition") ||
          !!(effect?.target as HTMLElement | null)?.hasAttribute("data-route-content"))
      );
    }),
  );

/** A view-transition animation is still running (React's finished 0ms placeholders don't count). */
const vtRunning = (page: Page): Promise<boolean> =>
  page.evaluate(() =>
    document
      .getAnimations()
      .some(
        (a) =>
          a.playState === "running" &&
          (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith("::view-transition"),
      ),
  );

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      !document.getAnimations().some((a) => {
        const effect = a.effect as KeyframeEffect | null;
        return (
          a.playState === "running" &&
          (!!effect?.pseudoElement?.startsWith("::view-transition") ||
            !!(effect?.target as HTMLElement | null)?.hasAttribute("data-route-content"))
        );
      }),
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

/**
 * Every animation seen is transform/opacity only and ends within --dur-slow (AC 1). Zero-length ones are
 * skipped: React parks pseudos it cancels with a 0ms fill (opacity/pointer-events/size), nothing moves.
 */
function expectCompositeOnly(all: Seen[], maxMs = 380): void {
  // Morph groups are the browser's own shared-element geometry (width/height + transform keyframes the UA
  // generates); only their timing is ours, checked by the duration bound below.
  for (const a of all.filter((x) => x.duration > 0)) {
    if (a.pseudo.startsWith("::view-transition-group")) {
      expect(a.duration + a.delay, a.pseudo).toBeLessThanOrEqual(maxMs);
      continue;
    }
    expect(
      a.props.filter((p) => !["opacity", "transform", "mixBlendMode"].includes(p)),
      a.pseudo || a.target,
    ).toEqual([]);
    expect(a.duration + a.delay, a.pseudo || a.target).toBeLessThanOrEqual(maxMs);
  }
}

/** The page never becomes a snapshot (no old/new root image), so it stays tappable while anything runs. */
function expectRootNeverCaptured(all: Seen[]): void {
  expect(
    all.filter((a) => /::view-transition-(old|new)\(root\)/.test(a.pseudo)).map((a) => a.pseudo),
  ).toEqual([]);
}

/** Exactly one page enter, at the given nesting depth, sliding from `offset` (opacity 0 → 1). */
function expectOneEnter(enter: Seen[], offset: string, depth = 0): void {
  expect(enter, "page enters").toHaveLength(1);
  const [a] = enter;
  expect(a?.depth).toBe(depth);
  expect(a?.props.sort()).toEqual(["opacity", "transform"]);
  expect(a?.transforms[0]).toBe(`translateX(${offset})`);
  expect(a?.transforms.at(-1)).toBe("none");
  // --dur-slow: a real duration (the minified token reads ".38s"), within the 380ms budget.
  expect((a?.duration ?? 0) + (a?.delay ?? 0)).toBeLessThanOrEqual(380);
  expect(a?.duration).toBeGreaterThanOrEqual(300);
}

const cards = (page: Page) => page.locator('[data-demo="cards"] a');

async function openGallery(page: Page): Promise<void> {
  await page.goto("/dev/motion");
  await expect(cards(page).first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("[P0-10] route transitions", () => {
  test("[P0-10] AC1 forward: the new page fades in sliding 8px from the right; transform + opacity, ≤ 380ms", async ({
    page,
  }) => {
    await openGallery(page);
    await record(page);
    await page.getByRole("link", { name: "Open a detail page" }).click();
    await expect(page).toHaveURL(/\/dev\/motion\/details$/);
    await settled(page);
    expectOneEnter(await contentAnimations(page), "8px");
    const all = await seen(page);
    expectRootNeverCaptured(all);
    expectCompositeOnly([...all, ...(await contentAnimations(page))]);
  });

  test("[P0-10] AC1 back reverses the direction (enters from the left)", async ({ page }) => {
    await page.goto("/dev/motion/details");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await record(page);
    await page.getByRole("link", { name: "← Motion gallery" }).click();
    await expect(page).toHaveURL(/\/dev\/motion$/);
    await settled(page);
    expectOneEnter(await contentAnimations(page), "-8px");
    const all = await seen(page);
    expectRootNeverCaptured(all);
    expectCompositeOnly([...all, ...(await contentAnimations(page))]);
  });

  test("[P0-10] AC1 tab switches slide only the tab content 6px in tab order; the bar stays still", async ({
    page,
  }) => {
    await page.goto("/dev/motion/tabs/wallet");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    const bar = page.getByRole("navigation", { name: "Demo tabs" });

    await record(page);
    await bar.getByRole("link", { name: "Me" }).click();
    await expect(page).toHaveURL(/\/tabs\/me$/);
    await settled(page);
    // The nested (tab content) boundary animates; the outer one, holding the bar, does not.
    expectOneEnter(await contentAnimations(page), "6px", 1);
    expectRootNeverCaptured(await seen(page));
    expect(await bar.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);

    await record(page);
    await bar.getByRole("link", { name: "Explore" }).click();
    await expect(page).toHaveURL(/\/tabs\/explore$/);
    await settled(page);
    expectOneEnter(await contentAnimations(page), "-6px", 1);
  });

  test("[P0-10] edge: browser back/forward has no direction, so the page only fades in", async ({
    page,
  }) => {
    await openGallery(page);
    await page.getByRole("link", { name: "Open a detail page" }).click();
    await expect(page).toHaveURL(/\/details$/);
    await settled(page);
    await record(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/dev\/motion$/);
    await expect(cards(page).first()).toBeVisible();
    await settled(page);
    const enter = await contentAnimations(page);
    expect(enter.length).toBeLessThanOrEqual(1);
    for (const a of enter) {
      expect(a.props).toEqual(["opacity"]);
      expect(a.transforms).toEqual([]);
    }
  });

  test("[P0-10] AC2 navigation never waits: taps register mid-transition; a second navigation wins", async ({
    page,
  }) => {
    await openGallery(page);
    // Slow every page enter and view-transition animation down (every frame) so clicks provably land while
    // they run. Plain WAAPI, so it works in every engine.
    await page.evaluate(() => {
      const w = window as unknown as { __rate: number };
      w.__rate = 1;
      const tick = (): void => {
        for (const a of document.getAnimations()) {
          const effect = a.effect as KeyframeEffect | null;
          const ours =
            (effect?.pseudoElement ?? "").startsWith("::view-transition") ||
            !!(effect?.target as HTMLElement | null)?.hasAttribute("data-route-content");
          if (ours && a.playbackRate !== w.__rate) {
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
    // Raw coordinates must be inside the viewport (on iPhone 14, 390×664, the 2nd card starts below the fold).
    // Scroll with a plain scrollIntoView: Playwright's scrollIntoViewIfNeeded waits for the slowed animation.
    const clickCentre = async (name: string, role: "button" | "link"): Promise<void> => {
      const target = page.getByRole(role, { name });
      await target.evaluate((el) => {
        el.scrollIntoView({ block: "center" });
      });
      const box = await target.boundingBox();
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
    expect(await motionRunning(page)).toBe(true);
    await clickCentre("Tap me", "button");
    // The tap reached the destination's button while the transition was still running.
    expect(await motionRunning(page)).toBe(true);
    expect((await clicks()).at(-1)).toBe("Tap me");
    await normal();
    await expect(page.getByTestId("tap-count")).toHaveText("1 tap");
    await settled(page);

    // A second navigation started while the first runs ends on the second URL, with nothing left running.
    await slow();
    await page.getByRole("link", { name: "← Motion gallery" }).click();
    await expect(page).toHaveURL(/\/dev\/motion$/);
    await expect(cards(page).nth(1)).toBeAttached();
    expect(await motionRunning(page)).toBe(true);
    await clickCentre("Patel's Corner Store", "link");
    expect((await clicks()).at(-1)).toContain("Patel's Corner Store");
    await normal();
    await expect(page).toHaveURL(/\/shop\/patel-corner$/);
    await expect(page.getByRole("heading", { name: "Patel's Corner Store" })).toBeVisible();
    await settled(page);
    expect(await vtRunning(page)).toBe(false);
    expect(await motionRunning(page)).toBe(false);
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
    // The morph carries the movement: the rest of the page only fades in (and WebKit doesn't crash on a
    // transform starting under a captured element).
    const enter = await contentAnimations(page);
    expect(enter).toHaveLength(1);
    expect(enter[0]?.props).toEqual(["opacity"]);
    expectRootNeverCaptured(await seen(page));
    expectCompositeOnly([...(await seen(page)), ...enter]);
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
    test(`[P0-10] AC4 ${variant.label}: the new page fades in sliding 8px, nothing on exit, no morph`, async ({
      page,
    }) => {
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
      // The same enter as everywhere (one, on the arriving content), none on the outgoing page, and no
      // view-transition pseudos: without typed View Transitions the morph is skipped, nothing errors.
      expectOneEnter(await contentAnimations(page), "8px");
      expect(await seen(page)).toEqual([]);
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
      const enter = await contentAnimations(page);
      // The page still fades in (opacity only); with typed View Transitions the morph pseudos run too.
      expect(enter).toHaveLength(1);
      expect(enter[0]?.props).toEqual(["opacity"]);
      const all = [...enter, ...(await seen(page))];
      if (typed) expect(all.length).toBeGreaterThan(1);
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

/**
 * Verify (P0-10): frame screenshots with every route animation held at ~50%. `shoot` disables animations
 * (it fast-forwards them), so these use `page.screenshot` with animations allowed. A paused animation is
 * not "running", so `settled` only waits once the hold is released.
 *
 * WebKit's `page.screenshot` cannot show a morph: it paints the page flat, so the destination element
 * appears in place at full opacity and `::view-transition-new` is empty, while the screen (the compositor)
 * shows the pair moving as one (measured 12 Nov 2026: screenshot vs recorded video of the same held frame).
 * So the WebKit morph frame comes from a recorded video of the held transition.
 */
test.describe("[P0-10] frame screenshots mid-transition", () => {
  type Scene = { name: string; from: string; to: RegExp; go: (page: Page) => Promise<void> };
  const scenes: Scene[] = [
    {
      name: "forward",
      from: "/dev/motion",
      to: /\/dev\/motion\/details$/,
      go: (page) => page.getByRole("link", { name: "Open a detail page" }).click(),
    },
    {
      name: "back",
      from: "/dev/motion/details",
      to: /\/dev\/motion$/,
      go: (page) => page.getByRole("link", { name: "← Motion gallery" }).click(),
    },
    {
      name: "tab",
      from: "/dev/motion/tabs/wallet",
      to: /\/tabs\/me$/,
      go: (page) =>
        page
          .getByRole("navigation", { name: "Demo tabs" })
          .getByRole("link", { name: "Me" })
          .click(),
    },
    {
      name: "morph",
      from: "/dev/motion",
      to: /\/shop\/brew-bloom$/,
      go: (page) => cards(page).first().click(),
    },
  ];

  type Held = { what: string; state: string; at: number; half: number; opacity: number };

  /** Pauses each route animation (VT pseudos + page enters) at half its duration until released. */
  const hold = (page: Page): Promise<void> =>
    page.evaluate(() => {
      const w = window as unknown as { __held: Set<Animation>; __holding: boolean };
      w.__held = new Set();
      w.__holding = true;
      const tick = (): void => {
        if (!w.__holding) return;
        for (const a of document.getAnimations()) {
          const effect = a.effect as KeyframeEffect | null;
          const ours =
            (effect?.pseudoElement ?? "").startsWith("::view-transition") ||
            !!(effect?.target as HTMLElement | null)?.hasAttribute("data-route-content");
          const total = Number(effect?.getComputedTiming().endTime ?? 0);
          if (!ours || total <= 0 || w.__held.has(a)) continue;
          a.pause();
          a.currentTime = total / 2;
          w.__held.add(a);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  /** What is held right now: proof that the picture is a mid-transition frame, not the page at rest. */
  const heldNow = (page: Page): Promise<Held[]> =>
    page.evaluate(() => {
      const w = window as unknown as { __held: Set<Animation> };
      return [...w.__held].map((a) => {
        const effect = a.effect as KeyframeEffect | null;
        const target = effect?.target as HTMLElement | null;
        const pseudo = effect?.pseudoElement ?? "";
        return {
          what: pseudo || "route-content",
          state: a.playState,
          at: Number(a.currentTime ?? -1),
          half: Number(effect?.getComputedTiming().endTime ?? 0) / 2,
          opacity: target ? Number(getComputedStyle(target, pseudo || null).opacity) : 1,
        };
      });
    });
  const release = (page: Page): Promise<void> =>
    page.evaluate(() => {
      const w = window as unknown as { __held: Set<Animation>; __holding: boolean };
      w.__holding = false;
      for (const a of w.__held) a.play();
    });

  /** Runs one scene up to the held frame and checks the hold. */
  async function toHeldFrame(page: Page, scene: Scene): Promise<void> {
    await page.goto(scene.from);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await hold(page);
    await scene.go(page);
    await expect(page).toHaveURL(scene.to);
    await page.waitForFunction(
      () => (window as unknown as { __held: Set<Animation> }).__held.size > 0,
    );
    const held = await heldNow(page);
    for (const h of held) {
      expect(h.state, `${scene.name} ${h.what}`).toBe("paused");
      expect(Math.abs(h.at - h.half), `${scene.name} ${h.what} at half`).toBeLessThan(1);
    }
    // Mid-fade: the arriving content (or, in a morph, the new snapshot) is partly transparent.
    const fading = held.filter(
      (h) => h.what === "route-content" || h.what.startsWith("::view-transition-new"),
    );
    expect(fading.length, `${scene.name}: something is fading in`).toBeGreaterThan(0);
    for (const h of fading) {
      expect(h.opacity, `${scene.name} ${h.what} opacity`).toBeGreaterThan(0);
      expect(h.opacity, `${scene.name} ${h.what} opacity`).toBeLessThan(1);
    }
    if (scene.name === "morph") {
      expect(
        held.some((h) => h.what.startsWith("::view-transition-group(")),
        "the morph's group is held",
      ).toBe(true);
      // The image changes shape (square thumb → wide header): both snapshots fill the moving box and crop,
      // so nothing spills out of it mid-flight (`fit="cover"`).
      const boxes = await page.evaluate(
        (name) => {
          const box = (pseudo: string): { height: string; fit: string; overflow: string } => {
            const cs = getComputedStyle(
              document.documentElement,
              `::view-transition-${pseudo}(${name})`,
            );
            return { height: cs.height, fit: cs.objectFit, overflow: cs.overflow };
          };
          return { group: box("group"), old: box("old"), fresh: box("new") };
        },
        vtName("shopimage", "brew-bloom"),
      );
      for (const snapshot of [boxes.old, boxes.fresh]) {
        expect(snapshot.fit).toBe("cover");
        expect(snapshot.overflow).toBe("clip");
        expect(Number.parseFloat(snapshot.height)).toBeCloseTo(
          Number.parseFloat(boxes.group.height),
          0,
        );
      }
    }
  }

  /** The last frame of a recorded video as a PNG (decoded in Chromium: the bundled ffmpeg only encodes). */
  async function lastVideoFrame(
    chromium: BrowserType,
    video: string,
    secondsFromEnd: number,
  ): Promise<Buffer> {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const data = readFileSync(video).toString("base64");
      await page.setContent(`<video id="v" muted src="data:video/webm;base64,${data}"></video>`);
      const png = await page.evaluate(async (back) => {
        const v = document.getElementById("v") as HTMLVideoElement;
        const seeked = (): Promise<void> =>
          new Promise((resolve) => {
            v.addEventListener(
              "seeked",
              () => {
                resolve();
              },
              { once: true },
            );
          });
        if (v.readyState < 1)
          await new Promise<void>((resolve) => {
            v.addEventListener(
              "loadedmetadata",
              () => {
                resolve();
              },
              { once: true },
            );
          });
        if (!Number.isFinite(v.duration)) {
          // A recorded webm has no duration in its header: seeking past the end makes the browser find it.
          v.currentTime = 1e6;
          await seeked();
        }
        v.currentTime = Math.max(0, v.duration - back);
        await seeked();
        const canvas = document.createElement("canvas");
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        canvas.getContext("2d")?.drawImage(v, 0, 0);
        return canvas.toDataURL("image/png").split(",")[1] ?? "";
      }, secondsFromEnd);
      expect(png.length, "a decoded video frame").toBeGreaterThan(1000);
      return Buffer.from(png, "base64");
    } finally {
      await browser.close();
    }
  }

  for (const width of [390, 1440] as const) {
    test(`[P0-10] verify: transitions held at ~50% at ${String(width)}px`, async ({
      page,
      browser,
      baseURL,
      playwright,
    }, testInfo) => {
      test.skip(
        !["chromium", "webkit"].includes(testInfo.project.name),
        "frame shots: desktop Chromium + WebKit",
      );
      const viewport = { width, height: width === 390 ? 844 : 900 };
      await page.setViewportSize(viewport);
      const dir = path.join(".artifacts", "screens", "P0-10");
      mkdirSync(dir, { recursive: true });
      const file = (scene: Scene): string =>
        path.join(dir, `frame-${scene.name}-${String(width)}--${testInfo.project.name}.png`);
      for (const scene of scenes) {
        if (scene.name === "morph" && testInfo.project.name === "webkit") continue;
        await toHeldFrame(page, scene);
        await page.screenshot({ path: file(scene), animations: "allow", caret: "initial" });
        await release(page);
        await settled(page);
      }
      if (testInfo.project.name !== "webkit") return;
      // WebKit morph: the held frame as the screen shows it, from a video (see the note above).
      const morph = scenes.find((s) => s.name === "morph");
      if (!morph || !baseURL) throw new Error("morph scene or baseURL missing");
      const context = await newClientContext(browser, baseURL, {
        viewport,
        recordVideo: { dir: testInfo.outputPath("video"), size: viewport },
      });
      const filmed = await context.newPage();
      await toHeldFrame(filmed, morph);
      await filmed.waitForTimeout(600); // a few video frames of the held picture
      const video = filmed.video();
      await context.close();
      if (!video) throw new Error("no video was recorded");
      writeFileSync(
        file(morph),
        await lastVideoFrame(playwright.chromium, await video.path(), 0.2),
      );
    });
  }
});
