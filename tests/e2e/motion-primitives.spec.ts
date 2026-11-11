import AxeBuilder from "@axe-core/playwright";
import { AXE_TAGS, expect, test } from "./support/test";
import type { Page } from "@playwright/test";

/**
 * P0-10 step B on /dev/motion: popover (AC 8), stagger (AC 7), reduced motion for the primitives (AC 5) and
 * the gallery itself (AC 9). Animations are read from `getAnimations()` on the element while they run.
 */
type Anim = {
  name: string;
  props: string[];
  duration: number;
  delay: number;
  transforms: string[];
};

async function openGallery(page: Page): Promise<void> {
  await page.goto("/dev/motion");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

/** Clicks a button by its text inside the page, waits one frame, and reads the animations on `selector`. */
async function clickAndRead(page: Page, buttonText: string, selector: string): Promise<Anim[]> {
  return page.evaluate(
    async ({ buttonText, selector }) => {
      const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === buttonText,
      );
      if (!button) throw new Error(`no button "${buttonText}"`);
      button.click();
      await new Promise<void>((r) =>
        requestAnimationFrame(() => {
          r();
        }),
      );
      const targets = [...document.querySelectorAll<HTMLElement>(selector)];
      return targets.flatMap((el) =>
        el.getAnimations().map((a) => {
          const effect = a.effect as KeyframeEffect | null;
          const frames = effect?.getKeyframes() ?? [];
          const timing = effect?.getComputedTiming();
          const named = a as Animation & { transitionProperty?: string; animationName?: string };
          return {
            name: named.animationName ?? named.transitionProperty ?? "",
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
        }),
      );
    },
    { buttonText, selector },
  );
}

/** The scale in a keyframe transform: `matrix(a, …)` or `scale(x)` (engines report either); 1 for none. */
const scaleOf = (t: string): number => {
  const m = /^(?:matrix|scale)\(\s*([\d.]+)/.exec(t.trim());
  return m ? Number(m[1]) : 1;
};

async function settledOn(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (s) =>
      [...document.querySelectorAll(s)].every((el) =>
        el.getAnimations().every((a) => a.playState !== "running"),
      ),
    selector,
  );
}

test.describe("[P0-10] popover", () => {
  test("[P0-10] AC8 enters from scale .95 + fade (never 0), ≤ 220ms, transform + opacity only", async ({
    page,
  }) => {
    await openGallery(page);
    const anims = await clickAndRead(page, "Open popover", ".popover");
    expect(anims.length).toBeGreaterThan(0);
    for (const a of anims) {
      for (const p of a.props) expect(["transform", "opacity"]).toContain(p);
      expect(a.duration + a.delay, a.name).toBeLessThanOrEqual(220);
    }
    const scale = anims.find((a) => a.name === "transform");
    expect(scale, "a scale transition runs").toBeTruthy();
    const first = scale?.transforms[0] ?? "";
    expect(first, "starts scaled, not at rest").not.toBe("none");
    const from = scaleOf(first);
    expect(from).toBeGreaterThanOrEqual(0.9);
    expect(from).toBeLessThan(1);
    await expect(page.getByRole("dialog", { name: "Popover demo" })).toBeVisible();
  });

  test("[P0-10] AC8 grows from its trigger: origin at the trigger's centre, clamped; edge trigger stays inside", async ({
    page,
  }) => {
    await openGallery(page);
    for (const [label, name] of [
      ["Open popover", "Popover demo"],
      ["At the edge", "Popover at the edge"],
    ] as const) {
      await page.getByRole("button", { name: label }).click();
      const panel = page.getByRole("dialog", { name });
      await expect(panel).toBeVisible();
      await settledOn(page, ".popover");
      const geo = await page.evaluate((n) => {
        const p = document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${n}"]`);
        const t = document.querySelector<HTMLElement>(`[aria-controls="${p?.id ?? ""}"]`);
        if (!p || !t) throw new Error("missing popover or trigger");
        const pr = p.getBoundingClientRect();
        const tr = t.getBoundingClientRect();
        const [ox, oy] = getComputedStyle(p).transformOrigin.split(" ").map(parseFloat);
        return {
          pr: {
            left: pr.left,
            top: pr.top,
            right: pr.right,
            bottom: pr.bottom,
            width: pr.width,
            height: pr.height,
          },
          tr: { left: tr.left, top: tr.top, bottom: tr.bottom, width: tr.width, height: tr.height },
          origin: { x: ox ?? -1, y: oy ?? -1 },
          viewport: document.documentElement.clientWidth,
        };
      }, name);
      const expectedX = Math.min(
        geo.pr.width,
        Math.max(0, geo.tr.left + geo.tr.width / 2 - geo.pr.left),
      );
      expect(Math.abs(geo.origin.x - expectedX), label).toBeLessThanOrEqual(1);
      // Below its trigger it grows from its top edge; flipped above (no room below), from its bottom edge.
      if (geo.pr.top >= geo.tr.bottom) expect(geo.origin.y, label).toBe(0);
      else {
        expect(geo.pr.bottom, label).toBeLessThanOrEqual(geo.tr.top);
        expect(Math.abs(geo.origin.y - geo.pr.height), label).toBeLessThanOrEqual(1);
      }
      expect(geo.pr.left).toBeGreaterThanOrEqual(16 - 0.5);
      expect(geo.pr.right).toBeLessThanOrEqual(geo.viewport - 16 + 0.5);
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(page.getByRole("button", { name: label })).toBeFocused();
    }
  });

  test("[P0-10] AC8 closes interruptibly: re-opening mid-exit reverses from where it is", async ({
    page,
  }) => {
    await openGallery(page);
    const trigger = page.getByRole("button", { name: "Open popover" });
    await trigger.click();
    const panel = page.getByRole("dialog", { name: "Popover demo" });
    await expect(panel).toBeVisible();
    await settledOn(page, ".popover");
    const midExit = await page.evaluate(async () => {
      const t = [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "Open popover",
      );
      // React commits a click in a microtask: wait on microtasks only, so no frame passes.
      const until = async (ok: () => boolean) => {
        for (let i = 0; i < 50 && !ok(); i++) await Promise.resolve();
      };
      const p = document.querySelector<HTMLElement>(".popover");
      if (!p) throw new Error("popover not open");
      t?.click();
      await until(() => p.dataset.state === "closing");
      const state = p.dataset.state;
      // Hold the exit early (10%: the strong ease-out is ~96% done at half-time), then re-open.
      const exits = p.getAnimations();
      for (const a of exits) {
        a.pause();
        a.currentTime = Number(a.effect?.getComputedTiming().duration ?? 0) * 0.1;
      }
      const before = Number(getComputedStyle(p).opacity);
      t?.click();
      await until(() => p.dataset.state === "open");
      const after = Number(getComputedStyle(p).opacity);
      return {
        state,
        exits: exits.length,
        before,
        after,
        same: document.querySelector(".popover") === p,
      };
    });
    expect(midExit.state).toBe("closing");
    expect(midExit.exits).toBeGreaterThan(0);
    expect(midExit.same).toBe(true);
    // Mid-exit, and the re-open continues from that value (reverses), never restarts from 0.
    expect(midExit.before).toBeGreaterThan(0.05);
    expect(midExit.before).toBeLessThan(0.95);
    expect(Math.abs(midExit.after - midExit.before)).toBeLessThan(0.05);
    await settledOn(page, ".popover");
    await expect(panel).toHaveAttribute("data-state", "open");
    await expect(panel).toHaveCSS("opacity", "1");
    // A press outside closes it.
    await page.mouse.click(5, 5);
    await expect(panel).toHaveCount(0);
  });
});

test.describe("[P0-10] stagger", () => {
  test("[P0-10] AC7 50 items: delays clamp after the 8th; the last item is clickable at once", async ({
    page,
  }) => {
    await openGallery(page);
    await page.getByRole("button", { name: "50 items" }).click();
    const items = page.locator('[data-demo="stagger"] > li');
    await expect(items).toHaveCount(50);
    const probe = await page.evaluate(() => {
      const lis = [...document.querySelectorAll<HTMLElement>('[data-demo="stagger"] > li')];
      const last = lis.at(-1);
      const button = last?.querySelector("button");
      if (!last || !button) throw new Error("no items");
      button.scrollIntoView({ block: "center" });
      const r = button.getBoundingClientRect();
      const cs = getComputedStyle(last);
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        x,
        y,
        hitsButton: !!hit && button.contains(hit),
        pointerEvents: cs.pointerEvents,
        visibility: cs.visibility,
        delays: lis.map((li) => getComputedStyle(li).animationDelay),
        stillAnimating: last.getAnimations().some((a) => a.playState === "running"),
      };
    });
    expect(probe.pointerEvents).not.toBe("none");
    expect(probe.visibility).toBe("visible");
    expect(probe.hitsButton).toBe(true);
    const ms = probe.delays.map((d) => Math.round(parseFloat(d) * (d.endsWith("ms") ? 1 : 1000)));
    expect(ms.slice(0, 3)).toEqual([0, 50, 100]);
    expect(ms[7]).toBe(350);
    expect(new Set(ms.slice(7))).toEqual(new Set([350]));
    expect(Math.max(...ms)).toBeLessThanOrEqual(600);
    await page.mouse.click(probe.x, probe.y);
    await expect(page.getByTestId("stagger-clicked")).toHaveText("Tapped item 50");
    // It was still waiting or entering when we looked, so the click didn't wait for it.
    expect(probe.stillAnimating).toBe(true);
  });

  test("[P0-10] AC7 edge: 0 and 1 items", async ({ page }) => {
    await openGallery(page);
    await page.getByRole("button", { name: "0 items", exact: true }).click();
    await expect(page.locator('[data-demo="stagger-empty"]')).toHaveText("No items.");
    await page.getByRole("button", { name: "1 item", exact: true }).click();
    const items = page.locator('[data-demo="stagger"] > li');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveCSS("animation-delay", "0s");
    await items.first().getByRole("button").click();
    await expect(page.getByTestId("stagger-clicked")).toHaveText("Tapped item 1");
  });
});

test.describe("[P0-10] primitives under reduced motion", () => {
  for (const how of ["system", "toggle"] as const) {
    test(`[P0-10] AC5 reduced motion (${how}): popover, overlays and stagger only fade, ≤ 150ms`, async ({
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
      const checks: [string, string, Anim[]][] = [];
      checks.push(["popover", "", await clickAndRead(page, "Open popover", ".popover")]);
      await page.keyboard.press("Escape");
      await expect(page.locator(".popover")).toHaveCount(0);
      checks.push([
        "modal",
        "",
        await clickAndRead(
          page,
          "Open modal",
          ".overlay .overlay-panel, .overlay .overlay-backdrop",
        ),
      ]);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Modal preset" })).toHaveCount(0);
      checks.push([
        "stagger",
        "moz-fade",
        await clickAndRead(page, "8 items", '[data-demo="stagger"] > li'),
      ]);
      for (const [what, name, anims] of checks) {
        expect(anims.length, what).toBeGreaterThan(0);
        for (const a of anims) {
          expect(a.props, what).toEqual(["opacity"]);
          expect(a.duration + a.delay, what).toBeLessThanOrEqual(150);
          for (const t of a.transforms) expect(t, what).not.toMatch(/translate|scale|matrix/);
          if (name) expect(a.name, what).toBe(name);
        }
      }
    });
  }
});

test.describe("[P0-10] motion gallery", () => {
  test("[P0-10] AC9 every demo has a labelled section, and the gallery is axe clean at rest", async ({
    page,
  }) => {
    await openGallery(page);
    const titles = await page
      .locator("main section[aria-labelledby]")
      .evaluateAll((sections) =>
        sections.map(
          (s) => document.getElementById(s.getAttribute("aria-labelledby") ?? "")?.textContent,
        ),
      );
    expect(titles).toEqual([
      "Forward and back",
      "Card to page",
      "Tab order",
      "Presets",
      "Popover",
      "Stagger",
      "Press and hover",
    ]);
    await settledOn(page, "*");
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });
});
