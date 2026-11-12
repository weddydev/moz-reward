import { expect, test } from "./support/test";
import type { Page } from "@playwright/test";

/**
 * P0-11 on /dev/motion: audio is never touched before a user gesture, the toggle is respected, and haptics
 * are a no-op where the device has no vibration. What each sound plays is unit-tested (`sound.test.ts`).
 */
type Audio = { made: number; resumed: number; started: number };

/** Counts AudioContext use from before any page script runs. */
async function watchAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __audio: Audio; AudioContext?: typeof AudioContext };
    w.__audio = { made: 0, resumed: 0, started: 0 };
    const Real = w.AudioContext;
    if (!Real) return;
    w.AudioContext = class extends Real {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.__audio.made += 1;
      }
      override resume(): Promise<void> {
        w.__audio.resumed += 1;
        return super.resume();
      }
      override createOscillator(): OscillatorNode {
        const osc = super.createOscillator();
        const start = osc.start.bind(osc);
        osc.start = (when?: number) => {
          w.__audio.started += 1;
          start(when);
        };
        return osc;
      }
    };
  });
}
const audio = (page: Page): Promise<Audio> =>
  page.evaluate(() => (window as unknown as { __audio: Audio }).__audio);

async function openGallery(page: Page): Promise<void> {
  await page.goto("/dev/motion");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByRole("button", { name: "Play credit" })).toBeEnabled();
}

test.describe("[P0-11] sound and haptics", () => {
  test("[P0-11] no audio before a gesture; the first tap unlocks and plays; each name plays", async ({
    page,
  }) => {
    await watchAudio(page);
    await openGallery(page);
    // Loaded, hydrated, scrolled: still no AudioContext (no autoplay warning to trigger).
    await page.getByRole("heading", { name: "Sound and haptics" }).scrollIntoViewIfNeeded();
    expect(await audio(page)).toEqual({ made: 0, resumed: 0, started: 0 });

    const status = page.getByTestId("sound-status");
    await page.getByRole("button", { name: "Play credit" }).click();
    await expect(status).toHaveText("Played the credit sound.");
    // A sound asked for inside the unlocking tap starts as soon as the context is awake.
    await expect.poll(async () => (await audio(page)).started).toBe(2);
    expect((await audio(page)).made).toBe(1);

    for (const [name, voices] of [
      ["reward", 6],
      ["tick", 1],
      ["arrival", 1],
    ] as const) {
      const before = (await audio(page)).started;
      await page.getByRole("button", { name: `Play ${name}` }).click();
      await expect(status).toHaveText(`Played the ${name} sound.`);
      await expect.poll(async () => (await audio(page)).started - before).toBe(voices);
    }
    expect((await audio(page)).made, "one AudioContext for the page").toBe(1);
  });

  test("[P0-11] the toggle is respected: off is silent (no context at all), on again plays", async ({
    page,
  }) => {
    await watchAudio(page);
    await openGallery(page);
    const toggle = page.getByRole("switch", { name: "Sounds and haptics" });
    const status = page.getByTestId("sound-status");
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await page.getByRole("button", { name: "Play tick" }).click();
    await expect(status).toHaveText("The tick sound stayed silent.");
    await page.getByRole("button", { name: "Vibrate: press" }).click();
    await expect(status).toContainText("No vibration for press");
    // (The tap on the toggle itself was a gesture with sounds still on, so a context may exist: silent.)
    expect((await audio(page)).started).toBe(0);

    // The choice survives a reload (stored per device), and still nothing touches audio.
    await page.reload();
    await expect(page.getByRole("button", { name: "Play credit" })).toBeEnabled();
    await expect(toggle).not.toBeChecked();
    await page.getByRole("button", { name: "Play tick" }).click();
    await expect(status).toHaveText("The tick sound stayed silent.");
    expect(await audio(page)).toEqual({ made: 0, resumed: 0, started: 0 });

    await toggle.click();
    await expect(toggle).toBeChecked();
    await page.getByRole("button", { name: "Play tick" }).click();
    await expect(status).toHaveText("Played the tick sound.");
    await expect.poll(async () => (await audio(page)).started).toBe(1);
    expect((await audio(page)).made).toBe(1);
  });

  test("[P0-11] haptics: the design's pattern where the device vibrates, a quiet no-op elsewhere", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __vibrated: unknown[] };
      w.__vibrated = [];
      if (window.sessionStorage.getItem("no-vibrate")) {
        Reflect.deleteProperty(Navigator.prototype, "vibrate");
        return;
      }
      Object.defineProperty(Navigator.prototype, "vibrate", {
        configurable: true,
        value: (pattern: unknown) => {
          w.__vibrated.push(pattern);
          return true;
        },
      });
    });
    await openGallery(page);
    const status = page.getByTestId("sound-status");
    await page.getByRole("button", { name: "Vibrate: credit" }).click();
    await expect(status).toHaveText("Vibrated: credit.");
    await page.getByRole("button", { name: "Vibrate: reward" }).click();
    await expect(status).toHaveText("Vibrated: reward.");
    expect(
      await page.evaluate(() => (window as unknown as { __vibrated: unknown[] }).__vibrated),
    ).toEqual([
      [18, 40, 18],
      [30, 50, 30, 50, 60],
    ]);

    await page.evaluate(() => {
      window.sessionStorage.setItem("no-vibrate", "1");
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "Play credit" })).toBeEnabled();
    await page.getByRole("button", { name: "Vibrate: press" }).click();
    await expect(status).toContainText("No vibration for press");
  });
});
